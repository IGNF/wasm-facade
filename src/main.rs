//! `apigen extract`: the API declared in the workspace around the current folder read into its JSON file. Its
//! configuration is the `[extract]` table of `apigen.toml`, given as JSON by the `apigen` package's CLI (`--config`),
//! or the defaults.
//!
//!   apigen extract [--check] [--config <json>]

use std::process::ExitCode;

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let check = args.iter().any(|a| a == "--check");
    let config = args
        .iter()
        .position(|a| a == "--config")
        .and_then(|i| args.get(i + 1))
        .map_or_else(
            || Ok(apigen::Config::default()),
            |json| {
                serde_json::from_str(json)
                    .map_err(|e| format!("--config: {e}"))
                    .and_then(|value| apigen::Config::from_json(&value))
            },
        );
    let result = match args.first().map(String::as_str) {
        Some("extract") => config.and_then(|config| apigen::run(&config, check)),
        _ => Err("usage: apigen extract [--check] [--config <json>]".into()),
    };

    match result {
        Ok(report) => {
            println!("{report}");

            ExitCode::SUCCESS
        }
        Err(error) => {
            eprintln!("apigen: {error}");

            ExitCode::FAILURE
        }
    }
}
