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
        Blur {
            radius,
            edge,
            progress: None,
        }
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
        let (width, height) = (width as usize, height as usize);

        (0..height).for_each(|row| {
            self.row(image, width, row);
            self.report(row + 1, 2 * height);
        });
        self.columns(image, width, height);
    }

    /// Blurs an image's copy once the browser is idle
    #[wasm_bindgen(js_name = applyLater)]
    pub async fn apply_later(&self, mut image: Vec<u8>, width: u32, height: u32) -> Vec<u8> {
        self.apply(&mut image, width, height);
        image
    }

    /// Blurs the rows a predicate keeps
    #[wasm_bindgen(js_name = applyWhere)]
    #[cfg_attr(wasm_facade, api(callback = "(row: number) => boolean"))]
    pub fn apply_where(&self, image: &mut [u8], width: u32, keep: &js_sys::Function) {
        let width = width as usize;
        let height = image.len() / 4 / width.max(1);

        (0..height)
            .filter(|&row| {
                keep.call1(&JsValue::NULL, &JsValue::from(row as u32))
                    .is_ok_and(|kept| kept.is_truthy())
            })
            .for_each(|row| self.row(image, width, row));
    }

    /// The share of the image blurred, 0 to 1
    #[wasm_bindgen(js_name = onProgress)]
    #[cfg_attr(wasm_facade, api(event = "progress", payload = "number"))]
    pub fn on_progress(&mut self, listener: js_sys::Function) {
        self.progress = Some(listener);
    }
}

/// The blur's passes, out of the declared API
impl Blur {
    /// The pixel `i` of a line of `len`, past its ends as the edges say
    fn at(&self, i: isize, len: usize) -> usize {
        let len = len as isize;

        match self.edge {
            Edge::Clamp => i.clamp(0, len - 1) as usize,
            Edge::Wrap => i.rem_euclid(len) as usize,
        }
    }

    /// A line of `len` pixels blurred in place, its pixel `k` at `index(k)`: a running sum over the window
    fn line(&self, image: &mut [u8], len: usize, index: impl Fn(usize) -> usize) {
        let r = self.radius.round().max(0.0) as isize;

        if r == 0 || len == 0 {
            return;
        }

        let source: Vec<[u8; 4]> = (0..len)
            .map(|k| {
                let p = index(k) * 4;
                [image[p], image[p + 1], image[p + 2], image[p + 3]]
            })
            .collect();
        let window = (2 * r + 1) as u32;
        let mut sum = (-r..=r).fold([0u32; 4], |mut sum, i| {
            let p = source[self.at(i, len)];
            (0..4).for_each(|c| sum[c] += u32::from(p[c]));
            sum
        });

        (0..len).for_each(|k| {
            let p = index(k) * 4;
            (0..4).for_each(|c| image[p + c] = (sum[c] / window) as u8);

            let (out, inn) = (
                source[self.at(k as isize - r, len)],
                source[self.at(k as isize + r + 1, len)],
            );
            (0..4).for_each(|c| sum[c] = sum[c] + u32::from(inn[c]) - u32::from(out[c]));
        });
    }

    /// The row `row` blurred
    fn row(&self, image: &mut [u8], width: usize, row: usize) {
        self.line(image, width, |k| row * width + k);
    }

    /// Every column blurred, the progress reported
    fn columns(&self, image: &mut [u8], width: usize, height: usize) {
        (0..width).for_each(|column| {
            self.line(image, height, |k| k * width + column);
            self.report(width + column + 1, 2 * width);
        });
    }

    /// `done` of `total` reported to the progress listener, at every tenth
    fn report(&self, done: usize, total: usize) {
        let tenth = (total / 10).max(1);

        if let Some(listener) = &self.progress
            && (done.is_multiple_of(tenth) || done == total)
        {
            let _ = listener.call1(&JsValue::NULL, &JsValue::from(done as f64 / total as f64));
        }
    }
}

/// The histogram of an image's luminance: 256 counts
#[cfg_attr(wasm_facade, api(function, convert = "image=pixels"))]
#[wasm_bindgen]
pub fn histogram(image: &[u8]) -> Vec<u32> {
    let mut counts = vec![0; 256];

    image.as_chunks::<4>().0.iter().for_each(|p| {
        let luminance =
            (299 * u32::from(p[0]) + 587 * u32::from(p[1]) + 114 * u32::from(p[2])) / 1000;
        counts[luminance as usize] += 1;
    });
    counts
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A row of `reds`, one pixel each, opaque
    fn row(reds: &[u8]) -> Vec<u8> {
        reds.iter().flat_map(|&r| [r, 0, 0, 255]).collect()
    }

    fn reds(image: &[u8]) -> Vec<u8> {
        image.as_chunks::<4>().0.iter().map(|p| p[0]).collect()
    }

    #[test]
    fn a_blur_averages_its_window_past_the_edges_as_they_say() {
        let mut clamped = row(&[0, 90, 180]);
        let mut wrapped = clamped.clone();

        Blur::new(1.0, Edge::Clamp).apply(&mut clamped, 3, 1);
        Blur::new(1.0, Edge::Wrap).apply(&mut wrapped, 3, 1);

        // Clamp: the first pixel's window is 0, 0, 90; wrap: 180, 0, 90
        assert_eq!(reds(&clamped), [30, 90, 150]);
        assert_eq!(reds(&wrapped), [90, 90, 90]);
        assert!(clamped.as_chunks::<4>().0.iter().all(|p| p[3] == 255));
    }

    #[test]
    fn a_blur_runs_down_the_columns_too() {
        // One column of three pixels: only the vertical pass moves it
        let mut image = row(&[0, 90, 180]);

        Blur::new(1.0, Edge::Clamp).apply(&mut image, 1, 3);
        assert_eq!(reds(&image), [30, 90, 150]);
    }

    #[test]
    fn a_blur_of_radius_zero_leaves_the_image() {
        let mut image = row(&[7, 200, 13]);

        Blur::new(0.0, Edge::Clamp).apply(&mut image, 3, 1);
        assert_eq!(reds(&image), [7, 200, 13]);
    }

    #[test]
    fn the_histogram_counts_each_pixel_at_its_luminance() {
        let image = [[255, 255, 255, 255], [0, 0, 0, 255], [0, 0, 0, 255]].concat();
        let counts = histogram(&image);

        assert_eq!(
            (counts[255], counts[0], counts.iter().sum::<u32>()),
            (1, 2, 3)
        );
    }
}
