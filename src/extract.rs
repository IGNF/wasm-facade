//! The declarations of a source file as the JSON file holds them, and its exported methods

use crate::Config;
use quote::ToTokens;
use serde_json::{Map, Value, json};
use syn::punctuated::Punctuated;
use syn::{Attribute, Expr, ImplItem, Item, Lit, Meta, ReturnType, Signature, Token, TraitItem};

/// The declared items of a file or an inline module: those carrying the attribute
#[must_use]
pub fn items(config: &Config, items: &[Item]) -> Vec<Value> {
    items
        .iter()
        .flat_map(|item| match item {
            Item::Mod(module) => module
                .content
                .as_ref()
                .map(|(_, inner)| self::items(config, inner))
                .unwrap_or_default(),
            _ => declared(config, item)
                .filter(|value| {
                    value["api"]
                        .as_object()
                        .is_some_and(|keys| !keys.is_empty())
                })
                .into_iter()
                .collect(),
        })
        .collect()
}

/// A struct, an enum, a function, an `impl` block or a host trait: its name, documentation, attribute's keys, and its
/// fields, variants, signature or methods
fn declared(config: &Config, item: &Item) -> Option<Value> {
    match item {
        Item::Struct(s) => {
            let fields = fields(config, &s.fields);

            Some(json!({
                "kind": "struct",
                "name": s.ident.to_string(),
                "doc": doc(&s.attrs),
                "api": keys(config, &s.attrs),
                "fields": fields,
            }))
        }
        Item::Enum(e) => {
            let variants: Vec<Value> = e
                .variants
                .iter()
                .map(|v| {
                    let mut variant = json!({ "name": v.ident.to_string(), "doc": doc(&v.attrs) });
                    let keys = keys(config, &v.attrs);
                    let fields = fields(config, &v.fields);

                    // A variant's keys and its fields (an event's payload), only where it has some
                    if keys.as_object().is_some_and(|k| !k.is_empty()) {
                        variant["api"] = keys;
                    }
                    if !fields.is_empty() {
                        variant["fields"] = json!(fields);
                    }

                    variant
                })
                .collect();

            Some(json!({
                "kind": "enum",
                "name": e.ident.to_string(),
                "doc": doc(&e.attrs),
                "api": keys(config, &e.attrs),
                "variants": variants,
            }))
        }
        Item::Fn(f) => {
            let mut value = signature(config, &f.sig, &f.attrs);

            value["kind"] = json!("function");
            value["api"] = keys(config, &f.attrs);

            Some(value)
        }
        Item::Impl(block) => {
            let methods: Vec<Value> = block
                .items
                .iter()
                .filter_map(|item| match item {
                    ImplItem::Fn(method) => {
                        let mut value = signature(config, &method.sig, &method.attrs);

                        value["api"] = keys(config, &method.attrs);

                        Some(value)
                    }
                    _ => None,
                })
                .collect();

            Some(json!({
                "kind": "class",
                "name": block.self_ty.to_token_stream().to_string(),
                "doc": doc(&block.attrs),
                "api": keys(config, &block.attrs),
                "methods": methods,
            }))
        }
        // A host: the methods of a class written by hand (in TypeScript), declared here for every binding. The trait
        // is usually never compiled (`#[cfg(<cfg>)]`): its types need not exist in Rust, its attributes may be bare
        Item::Trait(t) => {
            let methods: Vec<Value> = t
                .items
                .iter()
                .filter_map(|item| match item {
                    TraitItem::Fn(method) => {
                        let mut value = signature(config, &method.sig, &method.attrs);

                        value["api"] = keys(config, &method.attrs);

                        Some(value)
                    }
                    _ => None,
                })
                .collect();

            Some(json!({
                "kind": "host",
                "name": t.ident.to_string(),
                "doc": doc(&t.attrs),
                "api": keys(config, &t.attrs),
                "methods": methods,
            }))
        }
        _ => None,
    }
}

/// A struct's or a variant's fields: their name (a tuple's by position, `0`, `1`…), type, documentation and keys
fn fields(config: &Config, fields: &syn::Fields) -> Vec<Value> {
    fields
        .iter()
        .enumerate()
        .map(|(i, field)| {
            json!({
                "name": field.ident.as_ref().map_or_else(|| i.to_string(), ToString::to_string),
                "type": type_text(&field.ty),
                "doc": doc(&field.attrs),
                "api": keys(config, &field.attrs),
            })
        })
        .collect()
}

/// A function's or a method's name, exported name, documentation, parameters (name, type), result, whether it is
/// async, and its export's flags (`constructor`, `getter`, `setter`)
fn signature(config: &Config, sig: &Signature, attrs: &[Attribute]) -> Value {
    let params: Vec<Value> = sig
        .inputs
        .iter()
        .filter_map(|input| match input {
            syn::FnArg::Typed(t) => {
                let mut param = json!({
                    // The binding's name alone: `mut image` and `ref image` are `image` to the caller
                    "name": match &*t.pat {
                        syn::Pat::Ident(binding) => binding.ident.to_string(),
                        pat => pat.to_token_stream().to_string(),
                    },
                    "type": type_text(&t.ty),
                });
                let keys = keys(config, &t.attrs);

                // A parameter's own keys (`#[api(ts = "…")] camera: Camera`), only where it has some
                if keys.as_object().is_some_and(|k| !k.is_empty()) {
                    param["api"] = keys;
                }

                Some(param)
            }
            syn::FnArg::Receiver(_) => None,
        })
        .collect();
    let returns = match &sig.output {
        ReturnType::Default => Value::Null,
        ReturnType::Type(_, ty) => json!(type_text(ty)),
    };
    let flags: Vec<Value> = export_entries(config, attrs)
        .into_iter()
        .filter_map(|entry| match entry {
            Meta::Path(path) => Some(json!(path.to_token_stream().to_string())),
            _ => None,
        })
        .collect();
    let name = sig.ident.to_string();

    json!({
        "name": name,
        "export": exported_name(config, attrs).unwrap_or_else(|| name.clone()),
        "doc": doc(attrs),
        "params": params,
        "returns": returns,
        "async": sig.asyncness.is_some(),
        "flags": flags,
    })
}

/// A type as written, its tokens' spaces left out but after commas
fn type_text(ty: &syn::Type) -> String {
    ty.to_token_stream()
        .to_string()
        .replace(' ', "")
        .replace(',', ", ")
}

/// The documentation's lines, joined
fn doc(attrs: &[Attribute]) -> String {
    let lines: Vec<String> = attrs
        .iter()
        .filter(|a| a.path().is_ident("doc"))
        .filter_map(|a| match &a.meta {
            Meta::NameValue(nv) => match &nv.value {
                Expr::Lit(lit) => match &lit.lit {
                    Lit::Str(s) => {
                        Some(s.value().strip_prefix(' ').unwrap_or(&s.value()).to_owned())
                    }
                    _ => None,
                },
                _ => None,
            },
            _ => None,
        })
        .collect();

    lines.join("\n")
}

/// The keys of an item's `cfg_attr(<cfg>, <attribute>(…))`, or of a bare `#[<attribute>(…)]` (in code never compiled,
/// a `#[cfg(<cfg>)]` trait): a string, a number or a flag (true) each
fn keys(config: &Config, attrs: &[Attribute]) -> Value {
    let mut keys = Map::new();

    for attr in attrs
        .iter()
        .filter(|a| a.path().is_ident(&config.attribute))
    {
        if let Ok(entries) = attr.parse_args_with(Punctuated::<Meta, Token![,]>::parse_terminated) {
            entries.iter().for_each(|entry| insert(&mut keys, entry));
        }
    }
    for attr in attrs.iter().filter(|a| a.path().is_ident("cfg_attr")) {
        let Ok(parts) = attr.parse_args_with(Punctuated::<Meta, Token![,]>::parse_terminated)
        else {
            continue;
        };
        let mut parts = parts.into_iter();

        if !parts
            .next()
            .is_some_and(|cfg| cfg.path().is_ident(&config.cfg))
        {
            continue;
        }
        for part in parts {
            let Meta::List(inner) = part else { continue };

            if !inner.path.is_ident(&config.attribute) {
                continue;
            }

            let Ok(entries) =
                inner.parse_args_with(Punctuated::<Meta, Token![,]>::parse_terminated)
            else {
                continue;
            };

            entries.iter().for_each(|entry| insert(&mut keys, entry));
        }
    }

    Value::Object(keys)
}

/// An attribute's entry as a key: its text, its number, its boolean, or true for a flag
fn insert(keys: &mut Map<String, Value>, entry: &Meta) {
    let key = entry.path().to_token_stream().to_string();
    let value = match entry {
        Meta::NameValue(nv) => match &nv.value {
            Expr::Lit(lit) => match &lit.lit {
                Lit::Str(s) => json!(s.value()),
                Lit::Int(i) => i.base10_parse::<i64>().map_or(Value::Null, |n| json!(n)),
                Lit::Bool(b) => json!(b.value),
                _ => Value::Null,
            },
            _ => Value::Null,
        },
        _ => json!(true),
    };

    keys.insert(key, value);
}

/// The entries of an item's export attributes (`#[wasm_bindgen(…)]`)
fn export_entries(config: &Config, attrs: &[Attribute]) -> Vec<Meta> {
    attrs
        .iter()
        .filter(|a| a.path().is_ident(&config.export_attribute))
        .filter_map(|attr| {
            attr.parse_args_with(Punctuated::<Meta, Token![,]>::parse_terminated)
                .ok()
        })
        .flatten()
        .collect()
}

/// An item's `#[<export_attribute>(<export_name> = …)]`
fn exported_name(config: &Config, attrs: &[Attribute]) -> Option<String> {
    export_entries(config, attrs)
        .into_iter()
        .find_map(|entry| match entry {
            Meta::NameValue(nv) if nv.path.is_ident(&config.export_name) => {
                Some(nv.value.to_token_stream().to_string())
            }
            _ => None,
        })
}

/// The methods of the exported classes' exported `impl` blocks, by their exported name: their parameters (name,
/// type) and documentation
#[must_use]
pub fn exported_calls(config: &Config, file: &syn::File) -> Vec<(String, Value)> {
    let blocks = file.items.iter().filter_map(|item| match item {
        Item::Impl(block)
            if config
                .exported
                .contains(&block.self_ty.to_token_stream().to_string())
                && block
                    .attrs
                    .iter()
                    .any(|a| a.path().is_ident(&config.export_attribute)) =>
        {
            Some(block)
        }
        _ => None,
    });

    blocks
        .flat_map(|block| &block.items)
        .filter_map(|item| {
            let ImplItem::Fn(method) = item else {
                return None;
            };
            let name = exported_name(config, &method.attrs)?;
            let params: Vec<Value> = method
                .sig
                .inputs
                .iter()
                .filter_map(|input| match input {
                    syn::FnArg::Typed(t) => Some(json!({
                            // The binding's name alone: `mut image` and `ref image` are `image` to the caller
                    "name": match &*t.pat {
                        syn::Pat::Ident(binding) => binding.ident.to_string(),
                        pat => pat.to_token_stream().to_string(),
                    },
                            "type": type_text(&t.ty),
                        })),
                    syn::FnArg::Receiver(_) => None,
                })
                .collect();

            Some((name, json!({ "doc": doc(&method.attrs), "params": params })))
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn config() -> Config {
        Config::from_json(&json!({ "cfg": "my_api", "exported": ["Engine"] })).unwrap()
    }

    #[test]
    fn reads_a_declaration_and_its_inert_attributes_only() {
        let file: syn::File = syn::parse_str(
            r#"
            /// Discs
            #[cfg_attr(my_api, api(method = "addCircles", rows = "points"))]
            pub struct CircleOptions {
                /// Its color
                #[cfg_attr(my_api, api(default = "'#000'", slot = 0, option))]
                #[cfg_attr(other, api(ignored))]
                pub color: Styled<Color>,
            }
            pub struct NotDeclared;
            "#,
        )
        .unwrap();
        let found = items(&config(), &file.items);
        let item = &found[0];

        assert_eq!(found.len(), 1);
        assert_eq!(item["doc"], "Discs");
        assert_eq!(item["api"]["method"], "addCircles");
        assert_eq!(item["fields"][0]["type"], "Styled<Color>");
        assert_eq!(item["fields"][0]["api"]["default"], "'#000'");
        assert_eq!(item["fields"][0]["api"]["slot"], 0);
        assert_eq!(item["fields"][0]["api"]["option"], true);
        assert_eq!(item["fields"][0]["api"]["ignored"], Value::Null);
    }

    #[test]
    fn names_a_parameter_by_its_binding_alone() {
        let file: syn::File = syn::parse_str(
            r"
            #[cfg_attr(my_api, api(function))]
            pub fn blurred(mut image: Vec<u8>, ref width: u32) -> Vec<u8> { image }
            ",
        )
        .unwrap();
        let found = items(&config(), &file.items);

        assert_eq!(found[0]["params"][0]["name"], "image");
        assert_eq!(found[0]["params"][1]["name"], "width");
    }

    #[test]
    fn reads_a_class_its_methods_and_their_flags() {
        let file: syn::File = syn::parse_str(
            "/// A blur
            #[cfg_attr(my_api, api(class))]
            #[wasm_bindgen]
            impl Blur {
                #[wasm_bindgen(constructor)]
                pub fn new(radius: f64) -> Blur { todo!() }
                /// Its radius
                #[wasm_bindgen(getter)]
                pub fn radius(&self) -> f64 { 0.0 }
                #[wasm_bindgen(js_name = applyLater)]
                pub async fn apply_later(&self, pixels: Vec<u8>) -> Result<JsValue, JsValue> { todo!() }
            }",
        )
        .unwrap();
        let class = &items(&config(), &file.items)[0];

        assert_eq!(class["kind"], "class");
        assert_eq!(class["name"], "Blur");
        assert_eq!(class["methods"][0]["flags"], json!(["constructor"]));
        assert_eq!(class["methods"][1]["doc"], "Its radius");
        assert_eq!(class["methods"][1]["returns"], "f64");
        assert_eq!(class["methods"][2]["export"], "applyLater");
        assert_eq!(class["methods"][2]["async"], true);
        assert_eq!(class["methods"][2]["params"][0]["type"], "Vec<u8>");
    }

    #[test]
    fn reads_a_host_trait_never_compiled_its_bare_attributes_and_its_parameters_keys() {
        let file: syn::File = syn::parse_str(
            r#"/// A preview
            #[cfg(my_api)]
            #[api(host = "Preview")]
            pub trait PreviewHost {
                /// Fades to a radius
                #[api(animation)]
                fn fade_to(&self, radius: f64, #[api(ts = "number")] duration: Option<f64>);
                async fn show(image: Vec<u8>) -> Snapshot;
            }"#,
        )
        .unwrap();
        let host = &items(&config(), &file.items)[0];

        assert_eq!(host["kind"], "host");
        assert_eq!(host["name"], "PreviewHost");
        assert_eq!(host["api"]["host"], "Preview");
        assert_eq!(host["methods"][0]["doc"], "Fades to a radius");
        assert_eq!(host["methods"][0]["api"]["animation"], true);
        assert_eq!(host["methods"][0]["params"][0].get("api"), None);
        assert_eq!(host["methods"][0]["params"][1]["api"]["ts"], "number");
        assert_eq!(host["methods"][1]["async"], true);
        assert_eq!(host["methods"][1]["returns"], "Snapshot");
    }

    #[test]
    fn reads_a_tuple_struct_by_position_and_a_variant_s_payload_and_keys() {
        let file: syn::File = syn::parse_str(
            r#"#[api(record)]
            pub struct Point(#[api(label = "x")] f64, f64);
            #[api(events, host = "Preview")]
            pub enum PreviewEvent {
                /// Shown
                #[api(name = "shown")]
                Shown(Snapshot),
                Cleared,
            }"#,
        )
        .unwrap();
        let found = items(&config(), &file.items);

        assert_eq!(found[0]["fields"][0]["name"], "0");
        assert_eq!(found[0]["fields"][0]["api"]["label"], "x");
        assert_eq!(found[0]["fields"][1]["type"], "f64");
        assert_eq!(found[1]["variants"][0]["api"]["name"], "shown");
        assert_eq!(found[1]["variants"][0]["fields"][0]["type"], "Snapshot");
        assert_eq!(found[1]["variants"][1].get("fields"), None);
        assert_eq!(found[1]["variants"][1].get("api"), None);
    }

    #[test]
    fn reads_the_exported_calls_of_the_exported_classes() {
        let file: syn::File = syn::parse_str(
            "#[wasm_bindgen]
            impl Engine {
                #[wasm_bindgen(js_name = addCircles)]
                pub fn add_circles(&mut self, points: &[f64], feature_count: usize) -> u32 { 0 }
                #[wasm_bindgen(js_name = other)]
                pub fn other(&mut self) {}
            }
            impl Engine {
                #[wasm_bindgen(js_name = notExported)]
                pub fn not_exported(&mut self) {}
            }
            #[wasm_bindgen]
            impl Other {
                #[wasm_bindgen(js_name = notTheClass)]
                pub fn not_the_class(&mut self) {}
            }",
        )
        .unwrap();
        let methods = exported_calls(&config(), &file);

        assert_eq!(methods.len(), 2);
        assert_eq!(methods[0].0, "addCircles");
        assert_eq!(methods[0].1["params"][1]["type"], "usize");
    }
}
