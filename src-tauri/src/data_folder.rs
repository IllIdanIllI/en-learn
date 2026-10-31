use std::path::PathBuf;

/// Same as DATA_SUBDIR in src/core/dataFolder.ts.
const DATA_SUBDIR: &str = "EnglishExamCoach";

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

/// The custom data folder to grant access to: named by location.json, an absolute path without `..` whose last segment is `EnglishExamCoach`, and not refused.
/// Ok(None) means a default location (no file, malformed, no `dataDir`): nothing to grant. Err means location.json names a folder that is refused.
pub fn folder_to_grant(location_json: Option<&str>, home: &str, app_data: &str) -> Result<Option<PathBuf>, String> {
  let Some(dir) = location_json.and_then(parse_data_dir) else {
    return Ok(None);
  };
  let trimmed = dir.trim_end_matches('/');
  if !dir.starts_with('/') || trimmed.split('/').any(|seg| seg == "..") || !trimmed.rsplit('/').next().is_some_and(|last| last.eq_ignore_ascii_case(DATA_SUBDIR)) {
    return Err(format!("data folder is not an absolute {DATA_SUBDIR} folder: {dir}"));
  }
  match refuse_picked(&dir, home, app_data) {
    Some(r) => Err(format!("data folder refused: {r:?}")),
    None => Ok(Some(PathBuf::from(dir))),
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
    let ok = "/Users/Ann/Documents/EnglishExamCoach";
    let loc = |d: &str| format!(r#"{{"dataDir": "{d}"}}"#);
    assert_eq!(folder_to_grant(Some(&loc(ok)), HOME, APP), Ok(Some(PathBuf::from(ok))));
    assert_eq!(folder_to_grant(Some(&loc("/Users/Ann/.ssh/EnglishExamCoach")), HOME, APP), Ok(Some(PathBuf::from("/Users/Ann/.ssh/EnglishExamCoach"))));
    assert_eq!(folder_to_grant(Some(&loc("/Users/Ann/Documents/englishexamcoach/")), HOME, APP), Ok(Some(PathBuf::from("/Users/Ann/Documents/englishexamcoach/"))));
  }

  #[test]
  fn default_location_grants_nothing() {
    assert_eq!(folder_to_grant(None, HOME, APP), Ok(None));
    assert_eq!(folder_to_grant(Some("{"), HOME, APP), Ok(None));
    assert_eq!(folder_to_grant(Some("{}"), HOME, APP), Ok(None));
  }

  #[test]
  fn refuses_folders_a_planted_location_could_name() {
    let loc = |d: &str| format!(r#"{{"dataDir": "{d}"}}"#);
    for d in [
      "/Users/Ann",
      "/Users/Ann/Library/Mail",
      "/Volumes/EnglishExamCoach",
      "/Users/Ann/.ssh",
      "/etc",
      "/Users/Ann/Documents/other",
      "/Users/Ann/Documents/EnglishExamCoach/sub",
      "EnglishExamCoach",
      "Documents/EnglishExamCoach",
      "/Users/Ann/../Bob/EnglishExamCoach",
      "/Users/Ann/Documents/EnglishExamCoach/..",
    ] {
      assert!(folder_to_grant(Some(&loc(d)), HOME, APP).is_err(), "{d}");
    }
  }
}
