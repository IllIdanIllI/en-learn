use std::path::PathBuf;

#[derive(Debug, PartialEq, Eq)]
pub enum Refusal {
  Root,
  Home,
  System,
  Volume,
  Library,
}

/// Port of `refusePicked` in src/core/dataFolder.ts: trailing slashes are dropped, comparison is case-insensitive. First match wins.
pub fn refuse_picked(picked: &str, home: &str, app_data: &str) -> Option<Refusal> {
  let trim = |p: &str| p.trim_end_matches('/').to_lowercase();
  let (p, h, app) = (trim(picked), trim(home), trim(app_data));
  let within = |dir: &str| p == dir || p.starts_with(&format!("{dir}/"));
  if p.is_empty() {
    return Some(Refusal::Root);
  }
  if p == h {
    return Some(Refusal::Home);
  }
  if within("/system") {
    return Some(Refusal::System);
  }
  if let Some(name) = p.strip_prefix("/volumes/") {
    if !name.is_empty() && !name.contains('/') {
      return Some(Refusal::Volume);
    }
  }
  if within(&format!("{h}/library")) && !within(&app) {
    return Some(Refusal::Library);
  }
  None
}

/// The `dataDir` of a location.json, or None for malformed content, a missing field or an empty value.
pub fn parse_data_dir(contents: &str) -> Option<String> {
  let value: serde_json::Value = serde_json::from_str(contents).ok()?;
  value.get("dataDir")?.as_str().filter(|d| !d.is_empty()).map(String::from)
}

/// The custom data folder to grant access to: named by location.json and not refused. None means nothing to grant.
pub fn folder_to_grant(location_json: Option<&str>, home: &str, app_data: &str) -> Option<PathBuf> {
  let dir = parse_data_dir(location_json?)?;
  match refuse_picked(&dir, home, app_data) {
    Some(_) => None,
    None => Some(PathBuf::from(dir)),
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  const HOME: &str = "/Users/Ann";
  const APP: &str = "/Users/Ann/Library/Application Support/com.example.app";

  #[test]
  fn parses_valid_location() {
    assert_eq!(parse_data_dir(r#"{"dataDir": "/Users/Ann/Docs/EnglishExamCoach"}"#).as_deref(), Some("/Users/Ann/Docs/EnglishExamCoach"));
  }

  #[test]
  fn rejects_malformed_or_incomplete_location() {
    assert_eq!(parse_data_dir("not json"), None);
    assert_eq!(parse_data_dir(""), None);
    assert_eq!(parse_data_dir("null"), None);
    assert_eq!(parse_data_dir("{}"), None);
    assert_eq!(parse_data_dir(r#"{"dataDir": 5}"#), None);
    assert_eq!(parse_data_dir(r#"{"dataDir": ""}"#), None);
  }

  #[test]
  fn refuses_each_case() {
    assert_eq!(refuse_picked("/", HOME, APP), Some(Refusal::Root));
    assert_eq!(refuse_picked("", HOME, APP), Some(Refusal::Root));
    assert_eq!(refuse_picked("/Users/Ann", HOME, APP), Some(Refusal::Home));
    assert_eq!(refuse_picked("/users/ann/", HOME, APP), Some(Refusal::Home));
    assert_eq!(refuse_picked("/System", HOME, APP), Some(Refusal::System));
    assert_eq!(refuse_picked("/system/Library/x", HOME, APP), Some(Refusal::System));
    assert_eq!(refuse_picked("/Volumes/Disk", HOME, APP), Some(Refusal::Volume));
    assert_eq!(refuse_picked("/volumes/disk/", HOME, APP), Some(Refusal::Volume));
    assert_eq!(refuse_picked("/Users/Ann/Library", HOME, APP), Some(Refusal::Library));
    assert_eq!(refuse_picked("/Users/Ann/Library/Mail", HOME, APP), Some(Refusal::Library));
    assert_eq!(refuse_picked("/USERS/ANN/LIBRARY/mail", HOME, APP), Some(Refusal::Library));
  }

  #[test]
  fn allows_app_data_and_ordinary_folders() {
    assert_eq!(refuse_picked(APP, HOME, APP), None);
    assert_eq!(refuse_picked(&format!("{APP}/sub"), HOME, APP), None);
    assert_eq!(refuse_picked("/Users/Ann/Documents/data", HOME, APP), None);
    assert_eq!(refuse_picked("/Volumes/Disk/data", HOME, APP), None);
    assert_eq!(refuse_picked("/Systemic", HOME, APP), None);
  }

  #[test]
  fn grants_only_a_valid_custom_folder() {
    let ok = r#"{"dataDir": "/Users/Ann/Documents/EnglishExamCoach"}"#;
    assert_eq!(folder_to_grant(Some(ok), HOME, APP), Some(PathBuf::from("/Users/Ann/Documents/EnglishExamCoach")));
    assert_eq!(folder_to_grant(None, HOME, APP), None);
    assert_eq!(folder_to_grant(Some("{"), HOME, APP), None);
    assert_eq!(folder_to_grant(Some("{}"), HOME, APP), None);
    assert_eq!(folder_to_grant(Some(r#"{"dataDir": "/Users/Ann"}"#), HOME, APP), None);
    assert_eq!(folder_to_grant(Some(r#"{"dataDir": "/Users/Ann/Library/Mail"}"#), HOME, APP), None);
  }
}
