use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use wasm_bindgen::prelude::*;

#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeState {
    #[serde(default)]
    files: BTreeMap<String, FileRecord>,
    #[serde(default)]
    canvases: BTreeMap<String, CanvasRecord>,
    #[serde(default)]
    active_file: Option<String>,
    #[serde(default)]
    active_canvas: Option<String>,
    #[serde(default)]
    mobile: bool,
    #[serde(default)]
    revision: u64,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FileRecord {
    path: String,
    #[serde(default)]
    content: String,
    #[serde(default)]
    frontmatter: serde_json::Value,
    #[serde(default)]
    tags: Vec<String>,
    #[serde(default)]
    headings: Vec<serde_json::Value>,
    #[serde(default)]
    ctime: u64,
    #[serde(default)]
    mtime: u64,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CanvasRecord {
    path: String,
    #[serde(default)]
    nodes: Vec<serde_json::Value>,
    #[serde(default)]
    edges: Vec<serde_json::Value>,
    #[serde(default)]
    selected_node_ids: Vec<String>,
}

impl RuntimeState {
    fn normalize(mut self) -> Result<Self, String> {
        self.files = self
            .files
            .into_values()
            .map(|mut file| {
                file.path = normalize_path(&file.path)?;
                Ok((file.path.clone(), file))
            })
            .collect::<Result<_, String>>()?;
        self.canvases = self
            .canvases
            .into_values()
            .map(|mut canvas| {
                canvas.path = normalize_path(&canvas.path)?;
                Ok((canvas.path.clone(), canvas))
            })
            .collect::<Result<_, String>>()?;
        self.active_file = self
            .active_file
            .map(|path| normalize_path(&path))
            .transpose()?;
        self.active_canvas = self
            .active_canvas
            .map(|path| normalize_path(&path))
            .transpose()?;
        Ok(self)
    }

    fn bump_revision(&mut self) {
        self.revision = self.revision.saturating_add(1);
    }

    fn create_file(&mut self, path: &str, content: &str, timestamp: u64) -> Result<(), String> {
        let path = normalize_path(path)?;
        if self.files.contains_key(&path) {
            return Err(format!("File already exists: {path}"));
        }
        self.files.insert(
            path.clone(),
            FileRecord {
                path,
                content: content.to_owned(),
                ctime: timestamp,
                mtime: timestamp,
                ..FileRecord::default()
            },
        );
        self.bump_revision();
        Ok(())
    }

    fn modify_file(&mut self, path: &str, content: &str, timestamp: u64) -> Result<(), String> {
        let path = normalize_path(path)?;
        let file = self
            .files
            .get_mut(&path)
            .ok_or_else(|| format!("File not found: {path}"))?;
        file.content = content.to_owned();
        file.mtime = timestamp;
        self.bump_revision();
        Ok(())
    }

    fn rename_file(&mut self, old_path: &str, new_path: &str) -> Result<(), String> {
        let old_path = normalize_path(old_path)?;
        let new_path = normalize_path(new_path)?;
        if self.files.contains_key(&new_path) {
            return Err(format!("File already exists: {new_path}"));
        }
        let mut file = self
            .files
            .remove(&old_path)
            .ok_or_else(|| format!("File not found: {old_path}"))?;
        file.path.clone_from(&new_path);
        self.files.insert(new_path.clone(), file);
        if let Some(mut canvas) = self.canvases.remove(&old_path) {
            canvas.path.clone_from(&new_path);
            self.canvases.insert(new_path.clone(), canvas);
        }
        if self.active_file.as_deref() == Some(&old_path) {
            self.active_file = Some(new_path.clone());
        }
        if self.active_canvas.as_deref() == Some(&old_path) {
            self.active_canvas = Some(new_path);
        }
        self.bump_revision();
        Ok(())
    }

    fn delete_file(&mut self, path: &str) -> Result<(), String> {
        let path = normalize_path(path)?;
        if self.files.remove(&path).is_none() {
            return Err(format!("File not found: {path}"));
        }
        self.canvases.remove(&path);
        if self.active_file.as_deref() == Some(&path) {
            self.active_file = None;
        }
        if self.active_canvas.as_deref() == Some(&path) {
            self.active_canvas = None;
        }
        self.bump_revision();
        Ok(())
    }
}

#[wasm_bindgen]
pub struct VirtualObsidianCore {
    state: RuntimeState,
}

#[wasm_bindgen]
impl VirtualObsidianCore {
    #[wasm_bindgen(constructor)]
    pub fn new(config_json: &str) -> Result<VirtualObsidianCore, JsError> {
        let state = serde_json::from_str::<RuntimeState>(config_json)
            .map_err(|error| JsError::new(&format!("Invalid virtual Obsidian config: {error}")))?
            .normalize()
            .map_err(|error| JsError::new(&error))?;
        Ok(Self { state })
    }

    pub fn snapshot_json(&self) -> Result<String, JsError> {
        serde_json::to_string(&self.state).map_err(|error| JsError::new(&error.to_string()))
    }

    pub fn create_file(
        &mut self,
        path: &str,
        content: &str,
        timestamp: f64,
    ) -> Result<(), JsError> {
        self.state
            .create_file(path, content, timestamp.max(0.0) as u64)
            .map_err(|error| JsError::new(&error))
    }

    pub fn modify_file(
        &mut self,
        path: &str,
        content: &str,
        timestamp: f64,
    ) -> Result<(), JsError> {
        self.state
            .modify_file(path, content, timestamp.max(0.0) as u64)
            .map_err(|error| JsError::new(&error))
    }

    pub fn rename_file(&mut self, old_path: &str, new_path: &str) -> Result<(), JsError> {
        self.state
            .rename_file(old_path, new_path)
            .map_err(|error| JsError::new(&error))
    }

    pub fn delete_file(&mut self, path: &str) -> Result<(), JsError> {
        self.state
            .delete_file(path)
            .map_err(|error| JsError::new(&error))
    }

    pub fn set_active_file(&mut self, path: Option<String>) -> Result<(), JsError> {
        self.state.active_file = path
            .map(|value| normalize_path(&value))
            .transpose()
            .map_err(|error| JsError::new(&error))?;
        self.state.bump_revision();
        Ok(())
    }

    pub fn set_active_canvas(&mut self, path: Option<String>) -> Result<(), JsError> {
        self.state.active_canvas = path
            .map(|value| normalize_path(&value))
            .transpose()
            .map_err(|error| JsError::new(&error))?;
        self.state.bump_revision();
        Ok(())
    }

    pub fn set_mobile(&mut self, mobile: bool) {
        self.state.mobile = mobile;
        self.state.bump_revision();
    }

    pub fn set_canvas_data(&mut self, path: &str, data_json: &str) -> Result<(), JsError> {
        #[derive(Deserialize)]
        struct CanvasData {
            #[serde(default)]
            nodes: Vec<serde_json::Value>,
            #[serde(default)]
            edges: Vec<serde_json::Value>,
        }

        let path = normalize_path(path).map_err(|error| JsError::new(&error))?;
        let data = serde_json::from_str::<CanvasData>(data_json)
            .map_err(|error| JsError::new(&format!("Invalid canvas data: {error}")))?;
        let canvas = self
            .state
            .canvases
            .get_mut(&path)
            .ok_or_else(|| JsError::new(&format!("Canvas not found: {path}")))?;
        canvas.nodes = data.nodes;
        canvas.edges = data.edges;
        if let Some(file) = self.state.files.get_mut(&path) {
            file.content = data_json.to_owned();
        }
        self.state.bump_revision();
        Ok(())
    }

    pub fn set_frontmatter_json(
        &mut self,
        path: &str,
        frontmatter_json: &str,
    ) -> Result<(), JsError> {
        let path = normalize_path(path).map_err(|error| JsError::new(&error))?;
        let frontmatter = serde_json::from_str::<serde_json::Value>(frontmatter_json)
            .map_err(|error| JsError::new(&format!("Invalid frontmatter: {error}")))?;
        let file = self
            .state
            .files
            .get_mut(&path)
            .ok_or_else(|| JsError::new(&format!("File not found: {path}")))?;
        file.frontmatter = frontmatter;
        self.state.bump_revision();
        Ok(())
    }
}

fn normalize_path(path: &str) -> Result<String, String> {
    let normalized = path
        .replace('\\', "/")
        .split('/')
        .filter(|segment| !segment.is_empty() && *segment != ".")
        .collect::<Vec<_>>()
        .join("/");
    if normalized.is_empty() || normalized.split('/').any(|segment| segment == "..") {
        return Err(format!("Invalid vault path: {path}"));
    }
    Ok(normalized)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn state() -> RuntimeState {
        RuntimeState {
            files: BTreeMap::from([(
                "Notes/source.md".to_owned(),
                FileRecord {
                    path: "Notes/source.md".to_owned(),
                    content: "source".to_owned(),
                    ..FileRecord::default()
                },
            )]),
            active_file: Some("Notes/source.md".to_owned()),
            ..RuntimeState::default()
        }
    }

    #[test]
    fn mutates_files_deterministically() {
        let mut state = state();
        state.modify_file("Notes/source.md", "changed", 42).unwrap();
        state
            .rename_file("Notes/source.md", "Knowledge/source.md")
            .unwrap();
        assert_eq!(state.active_file.as_deref(), Some("Knowledge/source.md"));
        assert_eq!(state.files["Knowledge/source.md"].content, "changed");
        assert_eq!(state.files["Knowledge/source.md"].mtime, 42);
        assert_eq!(state.revision, 2);
    }

    #[test]
    fn rejects_escape_paths_and_duplicates() {
        let mut state = state();
        assert!(state.create_file("../outside.md", "", 0).is_err());
        assert!(state.create_file("Notes/source.md", "", 0).is_err());
    }

    #[test]
    fn serializes_in_stable_path_order() {
        let mut state = state();
        state.create_file("A.md", "a", 1).unwrap();
        let json = serde_json::to_string(&state).unwrap();
        assert!(json.find("A.md").unwrap() < json.find("Notes/source.md").unwrap());
    }

    #[test]
    fn keeps_canvas_and_active_context_consistent_with_file_lifecycle() {
        let mut state = RuntimeState {
            files: BTreeMap::from([(
                "Map.canvas".to_owned(),
                FileRecord {
                    path: "Map.canvas".to_owned(),
                    ..FileRecord::default()
                },
            )]),
            canvases: BTreeMap::from([(
                "Map.canvas".to_owned(),
                CanvasRecord {
                    path: "Map.canvas".to_owned(),
                    ..CanvasRecord::default()
                },
            )]),
            active_canvas: Some("Map.canvas".to_owned()),
            ..RuntimeState::default()
        };

        state
            .rename_file("Map.canvas", "Maps/Ideas.canvas")
            .unwrap();
        assert!(state.canvases.contains_key("Maps/Ideas.canvas"));
        state.delete_file("Maps/Ideas.canvas").unwrap();
        assert!(state.canvases.is_empty());
        assert_eq!(state.active_canvas, None);
    }
}
