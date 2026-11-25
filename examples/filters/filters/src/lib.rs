//! Image filters for the web: the example of a project using wasm-facade. Its public API is declared here, once: wasm-facade
//! writes its TypeScript facade, its React hooks and its reference from these declarations.

use wasm_bindgen::prelude::*;

/// How a filter reads past the image's edges
#[cfg_attr(wasm_facade, api(union))]
#[wasm_bindgen]
#[derive(Clone, Copy)]
pub enum Edge {
    /// The nearest pixel inside
    Clamp,
    /// The pixel on the other side
    Wrap,
}

/// A blur's options
#[cfg_attr(wasm_facade, api(options))]
pub struct BlurOptions {
    /// Its radius, pixels
    #[cfg_attr(wasm_facade, api(default = "2"))]
    pub radius: f64,
    /// How it reads past the edges
    #[cfg_attr(wasm_facade, api(default = "'clamp'"))]
    pub edge: Edge,
}

/// A box blur, applied to RGBA pixels in place
#[wasm_bindgen]
pub struct Blur {
    radius: f64,
    edge: Edge,
    progress: Option<js_sys::Function>,
}

/// A box blur, applied to RGBA pixels in place
#[cfg_attr(wasm_facade, api(class, options = "BlurOptions"))]
#[wasm_bindgen]
impl Blur {
    /// A blur of this radius and edges
    #[wasm_bindgen(constructor)]
    pub fn new(radius: f64, edge: Edge) -> Blur {
        Blur { radius, edge, progress: None }
    }

    /// Its radius, pixels
    #[wasm_bindgen(getter)]
    pub fn radius(&self) -> f64 {
        self.radius
    }

    /// Changes its radius
    #[wasm_bindgen(setter)]
    pub fn set_radius(&mut self, radius: f64) {
        self.radius = radius;
    }

    /// Blurs an image in place
    #[cfg_attr(wasm_facade, api(convert = "image=pixels"))]
    pub fn apply(&self, image: &mut [u8], width: u32, height: u32) {
        let _ = (image, width, height, self.edge);
    }

    /// Blurs an image's copy once the browser is idle
    #[wasm_bindgen(js_name = applyLater)]
    pub async fn apply_later(&self, image: Vec<u8>, width: u32, height: u32) -> Vec<u8> {
        let _ = (width, height);

        image
    }

    /// Blurs the rows a predicate keeps
    #[wasm_bindgen(js_name = applyWhere)]
    #[cfg_attr(wasm_facade, api(callback = "(row: number) => boolean"))]
    pub fn apply_where(&self, image: &mut [u8], width: u32, keep: &js_sys::Function) {
        let _ = (image, width, keep);
    }

    /// The share of the image blurred, 0 to 1
    #[wasm_bindgen(js_name = onProgress)]
    #[cfg_attr(wasm_facade, api(event = "progress", payload = "number"))]
    pub fn on_progress(&mut self, listener: js_sys::Function) {
        self.progress = Some(listener);
    }
}

/// The histogram of an image's luminance: 256 counts
#[cfg_attr(wasm_facade, api(function, convert = "image=pixels"))]
#[wasm_bindgen]
pub fn histogram(image: &[u8]) -> Vec<u32> {
    let mut counts = vec![0; 256];

    image.chunks(4).for_each(|p| counts[usize::from(p[0])] += 1);
    counts
}
