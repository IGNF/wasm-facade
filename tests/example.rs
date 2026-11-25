//! The extractor on the example repository (`examples/filters`, image filters), its declarations read into the
//! `api.json` it holds

use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};

#[test]
fn the_example_repository_reads_as_its_api_json() {
    let repo = Path::new(env!("CARGO_MANIFEST_DIR")).join("examples/filters");
    let source = repo.join("filters/src/lib.rs");
    let file = syn::parse_file(&fs::read_to_string(&source).unwrap()).unwrap();
    let api = wasm_facade::api(
        &wasm_facade::Config::default(),
        &repo,
        &[(PathBuf::from(&source), file)],
    )
    .unwrap();
    let held: Value =
        serde_json::from_str(&fs::read_to_string(repo.join("wasm-facade/api.json")).unwrap())
            .unwrap();

    assert_eq!(api, held);
    assert_eq!(api["schema"], wasm_facade::SCHEMA);
    assert_eq!(
        api["items"]
            .as_array()
            .unwrap()
            .iter()
            .map(|i| i["kind"].as_str().unwrap())
            .collect::<Vec<_>>(),
        ["class", "struct", "enum", "function"]
    );
}
