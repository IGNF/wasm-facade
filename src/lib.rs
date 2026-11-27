//! wasm-facade: a public API declared once in Rust, read into a JSON file (`data/api.schema.json`, versioned) from which the
//! `wasm-facade` package (TypeScript) writes the bindings: an idiomatic TypeScript facade over the wasm-bindgen exports, its
//! framework bindings, its reference. No project is known here: what is read is the configuration's ([`Config`]).
//!
//! The declarations are the items carrying `#[cfg_attr(<cfg>, <attribute>(…))]`, a cfg never set: the attribute is
//! inert in every build (no proc-macro, nothing compiled), its keys strings, numbers or flags, free for the project's
//! patterns:
//!
//! - a struct (an options struct, a style, a settings struct): its fields, their types, docs and keys
//! - an enum: its variants (a union of strings in TypeScript)
//! - a `pub fn` exported by wasm-bindgen: a free function, its parameters, its result, whether it is async
//! - an `impl` block exported by wasm-bindgen: a class, its methods (constructor, getters, setters, async), each with
//!   its own keys; its dependencies (`deps = "map: GeoMap, engine: Engine"`, the types the project's) read into
//!   `deps`, a name and a type each, in their order
//!
//! The calls a declaration names by its `call_keys` are resolved among the exported methods of the `exported` classes
//! (by their `export_name`, `js_name`): a call named but not exported, or exported twice, is an error naming the
//! files. Every member of the workspace is read (or the `members` given): code moved between crates or folders makes
//! the same file.

mod extract;
mod workspace;

use serde_json::{Map, Value, json};
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

pub use extract::{dependencies, exported_calls, items};
pub use workspace::{Workspace, workspace};

/// The version of the file's format (`data/api.schema.json`)
pub const SCHEMA: u32 = 1;

/// What the declarations and the calls look like, where to read them and where the file goes; each key has a
/// default, so that a project following the conventions gives almost nothing
#[derive(Clone, Debug)]
pub struct Config {
    /// The cfg guarding the declarations' attribute (default `wasm_facade`): never set
    pub cfg: String,
    /// The attribute inside (default `api`)
    pub attribute: String,
    /// The classes whose exported methods the declarations name as calls (default none)
    pub exported: Vec<String>,
    /// The attribute exporting an item (default `wasm_bindgen`)
    pub export_attribute: String,
    /// The key of that attribute naming the item's export (default `js_name`)
    pub export_name: String,
    /// The declarations' keys naming a call (default `call`)
    pub call_keys: Vec<String>,
    /// The members read, their folders from the workspace's root (default all of the workspace's)
    pub members: Option<Vec<String>>,
    /// The file written, from the workspace's root (default `wasm-facade/api.json`)
    pub out: String,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            cfg: "wasm_facade".into(),
            attribute: "api".into(),
            exported: Vec::new(),
            export_attribute: "wasm_bindgen".into(),
            export_name: "js_name".into(),
            call_keys: vec!["call".into()],
            members: None,
            out: "wasm-facade/api.json".into(),
        }
    }
}

impl Config {
    /// The defaults, those keys of `json` (the `[extract]` table of `wasm-facade.toml`, as JSON) over them
    ///
    /// # Errors
    ///
    /// A key of the wrong type
    pub fn from_json(json: &Value) -> Result<Self, String> {
        let mut config = Self::default();
        let text = |key: &str, into: &mut String| -> Result<(), String> {
            match &json[key] {
                Value::Null => Ok(()),
                Value::String(s) => {
                    s.clone_into(into);

                    Ok(())
                }
                _ => Err(format!("[extract] {key}: a string")),
            }
        };
        let list = |key: &str| -> Result<Option<Vec<String>>, String> {
            match &json[key] {
                Value::Null => Ok(None),
                Value::Array(values) => values
                    .iter()
                    .map(|v| {
                        v.as_str()
                            .map(str::to_owned)
                            .ok_or(format!("[extract] {key}: strings"))
                    })
                    .collect::<Result<Vec<_>, _>>()
                    .map(Some),
                _ => Err(format!("[extract] {key}: a list of strings")),
            }
        };

        text("cfg", &mut config.cfg)?;
        text("attribute", &mut config.attribute)?;
        text("export_attribute", &mut config.export_attribute)?;
        text("export_name", &mut config.export_name)?;
        text("out", &mut config.out)?;
        if let Some(exported) = list("exported")? {
            config.exported = exported;
        }
        if let Some(keys) = list("call_keys")? {
            config.call_keys = keys;
        }
        config.members = match &json["members"] {
            Value::String(all) if all == "all" => None,
            _ => list("members")?,
        };

        Ok(config)
    }
}

/// The API of `files` (each a path and its parsed source) as the file holds it: the declarations by name, the calls
/// they name; paths shown from `root` in the errors
///
/// # Errors
///
/// An item declared twice, a call named and not exported or exported twice, a class's `deps` not `name: Type, …`
pub fn api(config: &Config, root: &Path, files: &[(PathBuf, syn::File)]) -> Result<Value, String> {
    let shown = |path: &Path| {
        path.strip_prefix(root)
            .unwrap_or(path)
            .display()
            .to_string()
    };
    let mut declared: BTreeMap<String, (Value, PathBuf)> = BTreeMap::new();
    let mut exported: BTreeMap<String, Vec<(Value, PathBuf)>> = BTreeMap::new();

    for (path, file) in files {
        for item in items(config, &file.items) {
            let name = item["name"].as_str().unwrap_or_default().to_owned();

            if let Some((_, first)) = declared.get(&name) {
                return Err(format!(
                    "`{name}` is declared twice: {} and {}",
                    shown(first),
                    shown(path)
                ));
            }
            declared.insert(name, (item, path.clone()));
        }
        for (name, method) in exported_calls(config, file) {
            exported
                .entry(name)
                .or_default()
                .push((method, path.clone()));
        }
    }

    let mut declared: Vec<Value> = declared.into_values().map(|(item, _)| item).collect();

    // A class's dependencies (`deps = "map: GeoMap, …"`), read once here for every binding: its constructor takes them
    for item in &mut declared {
        let text = match (&item["kind"], &item["api"]["deps"]) {
            (Value::String(kind), Value::String(text)) if kind == "class" => text.clone(),
            _ => continue,
        };
        let deps = dependencies(&text).map_err(|e| {
            format!(
                "`{}`'s deps: {e}",
                item["name"].as_str().unwrap_or_default()
            )
        })?;

        item["deps"] = json!(deps);
    }
    let mut calls = Map::new();

    for (name, by) in call_names(config, &declared) {
        match exported.remove(&name).unwrap_or_default().as_slice() {
            [] => {
                return Err(format!(
                    "`{by}` names the call `{name}`: no `#[{}({} = {name})]` method of {} in the workspace",
                    config.export_attribute,
                    config.export_name,
                    config.exported.join(", ")
                ));
            }
            [(method, _)] => {
                calls.insert(name, method.clone());
            }
            found => {
                let places: Vec<String> = found.iter().map(|(_, path)| shown(path)).collect();

                return Err(format!(
                    "`{by}` names the call `{name}`, exported {} times: {}",
                    found.len(),
                    places.join(", ")
                ));
            }
        }
    }

    Ok(json!({
        "$comment": "Made by `wasm-facade extract` from the workspace's declarations and the calls they name: not to edit",
        "schema": SCHEMA,
        "items": declared,
        "calls": calls,
    }))
}

/// The calls the declarations name, each with the declaration naming it (the first)
fn call_names(config: &Config, items: &[Value]) -> BTreeMap<String, String> {
    let mut names = BTreeMap::new();

    for item in items {
        let owner = item["name"].as_str().unwrap_or_default();
        let fields = item["fields"]
            .as_array()
            .into_iter()
            .flatten()
            .map(|f| &f["api"]);

        for keys in std::iter::once(&item["api"]).chain(fields) {
            for key in &config.call_keys {
                if let Some(call) = keys[key.as_str()].as_str() {
                    names
                        .entry(call.to_owned())
                        .or_insert_with(|| owner.to_owned());
                }
            }
        }
    }

    names
}

/// The API of the workspace around the current folder written to (or, `check`, compared with) the configuration's
/// file: what it says it did
///
/// # Errors
///
/// No workspace, a file unreadable, a declaration wrong; with `check`, a file not the one the sources make
pub fn run(config: &Config, check: bool) -> Result<String, String> {
    let Workspace { root, members } = workspace(config)?;
    let mut files = Vec::new();

    for dir in &members {
        for path in workspace::rust_files(dir)? {
            let text = fs::read_to_string(&path).map_err(|e| format!("{}: {e}", path.display()))?;
            let file = syn::parse_file(&text).map_err(|e| format!("{}: {e}", path.display()))?;

            files.push((path, file));
        }
    }

    let api = api(config, &root, &files)?;
    let text = format!(
        "{}\n",
        serde_json::to_string_pretty(&api).map_err(|e| e.to_string())?
    );
    let out = root.join(&config.out);
    let name = &config.out;
    let count = |key: &str| {
        api[key]
            .as_array()
            .map_or_else(|| api[key].as_object().map_or(0, Map::len), Vec::len)
    };

    if check {
        let current = fs::read_to_string(&out).unwrap_or_default();

        return if current == text {
            Ok(format!("{name}: as the declarations make it"))
        } else {
            Err(format!(
                "{name} is not the one the declarations make: run `wasm-facade generate`"
            ))
        };
    }
    if let Some(parent) = out.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("{}: {e}", parent.display()))?;
    }
    fs::write(&out, text).map_err(|e| format!("{}: {e}", out.display()))?;

    Ok(format!(
        "{name}: {} declarations, {} calls",
        count("items"),
        count("calls")
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_defaults_then_the_keys_given() {
        let config = Config::from_json(
            &json!({ "cfg": "my_api", "exported": ["Engine"], "members": "all" }),
        )
        .unwrap();

        assert_eq!(config.cfg, "my_api");
        assert_eq!(config.attribute, "api");
        assert_eq!(config.exported, ["Engine"]);
        assert_eq!(config.call_keys, ["call"]);
        assert!(config.members.is_none());
        assert!(Config::from_json(&json!({ "cfg": 3 })).is_err());
    }

    #[test]
    fn a_call_named_and_not_exported_is_an_error() {
        let config =
            Config::from_json(&json!({ "cfg": "my_api", "exported": ["Engine"] })).unwrap();
        let file = syn::parse_str("#[cfg_attr(my_api, api(call = \"addDots\"))] pub struct Dots;")
            .unwrap();
        let error = api(&config, Path::new("/"), &[(PathBuf::from("/a.rs"), file)]).unwrap_err();

        assert!(error.contains("names the call `addDots`"), "{error}");
    }

    #[test]
    fn a_class_s_dependencies_are_read_into_the_file_a_wrong_one_an_error() {
        let config = Config::from_json(&json!({ "cfg": "my_api" })).unwrap();
        let file = |deps: &str| {
            syn::parse_str(&format!(
                "#[cfg_attr(my_api, api(class, deps = \"{deps}\"))] #[wasm_bindgen] impl Layer {{}}"
            ))
            .unwrap()
        };
        let read = api(
            &config,
            Path::new("/"),
            &[(PathBuf::from("/a.rs"), file("map: GeoMap"))],
        )
        .unwrap();
        let error = api(
            &config,
            Path::new("/"),
            &[(PathBuf::from("/a.rs"), file("map"))],
        )
        .unwrap_err();

        assert_eq!(
            read["items"][0]["deps"],
            json!([{ "name": "map", "type": "GeoMap" }])
        );
        assert_eq!(read["items"][0]["api"]["deps"], "map: GeoMap");
        assert_eq!(error, "`Layer`'s deps: `map` is not `name: Type`");
    }

    #[test]
    fn an_item_declared_twice_is_an_error() {
        let config = Config::from_json(&json!({ "cfg": "my_api" })).unwrap();
        let file = || syn::parse_str("#[cfg_attr(my_api, api(options))] pub struct Dots;").unwrap();
        let error = api(
            &config,
            Path::new("/"),
            &[
                (PathBuf::from("/a.rs"), file()),
                (PathBuf::from("/b.rs"), file()),
            ],
        )
        .unwrap_err();

        assert_eq!(error, "`Dots` is declared twice: a.rs and b.rs");
    }
}
