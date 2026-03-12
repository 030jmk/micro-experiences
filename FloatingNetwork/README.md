# Floating Network

An interactive floating network visualization that runs as a Progressive Web App. White nodes drift across a black canvas, connecting when nearby to form an organic, evolving mesh.

## Getting Started

### Host it

Serve the files with any static HTTP server. All you need are three files:

```
index.html
manifest.json
sw.js
```

For example, using Python:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080` in your browser.

### GitHub Pages

Push the repository to GitHub and enable Pages from **Settings > Pages > Source: main / root**. The included `.nojekyll` file ensures all files are served correctly.

### Install as PWA

Once hosted over HTTPS (or localhost), your browser will offer an "Install" prompt. On mobile, use "Add to Home Screen". The app works fully offline after the first visit.

## Usage

### Settings Menu

The settings panel is hidden by default to keep the visualization clean. Open it by **triple-clicking** anywhere on the page. Close it by clicking the **X** button, clicking outside the modal, or triple-clicking again.

The settings menu has four sections:

#### Background

| Control | Description | Default |
|---------|-------------|---------|
| Type | Switch between **Solid** color and **Gradient** | Solid |
| Color | Background color (solid mode) | Black `#000000` |
| Direction | Gradient direction: left-to-right, top-to-bottom, diagonal, or radial (gradient mode) | Left to Right |
| Start / Middle / End | Three color stops for the gradient | Black / Dark gray / Black |

#### Nodes

| Control | Range | Default |
|---------|-------|---------|
| Count | 10 – 500 | 200 |
| Speed | 0.1 – 3.0 | 0.5 |
| Color | Any color | White `#ffffff` |
| Max Distance | 50 – 600 | 300 |
| Overflow | 0 – 500 | 0 |

**Count** sets how many nodes float on screen. **Speed** controls how fast they move. **Max Distance** determines how close two nodes must be to draw a connecting line between them. **Overflow** extends the bounce boundary beyond the visible canvas so nodes drift off-screen, making the visualization feel like a window into a larger space.

#### Text

| Control | Range | Default |
|---------|-------|---------|
| Heading text | Free text | (empty) |
| Heading size | 1 – 8 em | 4 em |
| Heading color | Any color | Black `#000000` |
| Paragraph text | Free text | (empty) |
| Paragraph size | 0.5 – 4 rem | 2 rem |
| Paragraph color | Any color | Black `#000000` |

Text is centered on screen and overlays the network visualization.

#### Share

The share section shows the current URL with all settings encoded. Click **Copy** to copy it to the clipboard.

### Shareable URLs

Every setting is mirrored in the URL as a query parameter. Only non-default values appear in the URL to keep links short. Share the link and the recipient sees the exact same configuration.

**Example:**

```
https://your-site.com/index.html?h1=Hello&nodeCount=100&nodeColor=00ff00&bgColor=1a1a2e
```

This shows a heading "Hello" with 100 green nodes on a dark blue background.

#### Full Parameter Reference

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `bgType` | `solid` or `gradient` | `solid` | Background mode |
| `bgColor` | hex (no #) | `000000` | Solid background color |
| `bgGradientDir` | string | `to right` | Gradient CSS direction or `circle` for radial |
| `gradColor1` | hex (no #) | `000000` | Gradient start color |
| `gradColor2` | hex (no #) | `333333` | Gradient middle color |
| `gradColor3` | hex (no #) | `000000` | Gradient end color |
| `nodeCount` | integer | `200` | Number of nodes |
| `speed` | float | `0.5` | Node movement speed |
| `nodeColor` | hex (no #) | `ffffff` | Node and connection line color |
| `maxDistance` | integer | `300` | Max distance for drawing connections |
| `overflow` | integer | `0` | Pixels beyond canvas edge before nodes bounce back |
| `h1` | string | (empty) | Heading text |
| `h1Size` | float | `4` | Heading font size in em |
| `h1Color` | hex (no #) | `000000` | Heading text color |
| `p` | string | (empty) | Paragraph text |
| `pSize` | float | `2` | Paragraph font size in rem |
| `pColor` | hex (no #) | `000000` | Paragraph text color |

## Project Structure

```
FloatingNetwork/
├── index.html       # Visualization, settings modal, and all logic
├── manifest.json    # PWA manifest
├── sw.js            # Service worker for offline caching
└── .nojekyll        # Ensures GitHub Pages serves all files
```

## License

Internal use.
