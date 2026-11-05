# Drape Day

A browser-based colour analysis tool. Take a photo, and Drape Day measures your skin, hair and eye colour, drapes colours under your face, and explains which ones suit you and why.

## Visual of Web App

Click here to see and use the <a href="https://fatima-d09.github.io/DrapeDay/" target="_blank">colour analysis tool</a> 

## Features

- **Light check:** checks brightness, shine, evenness and light colour before analysing the photo.
- **Drape test:** scores 25 colours draped under the chin, each with an explanation.
- **Results:** your season, top colours, combinations to wear and avoid, and best and worst shades across 486 hex colours.
- **Hex lab:** scores random or custom hex colours and shows what the best ones have in common.

## Running it

No build step or dependencies. Keep `index.html`, `styles.css` and `app.js` in one folder and open `index.html`.

For webcam access, serve the folder locally:

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000. Phone cameras require HTTPS, so deploy to a static host such as Netlify or GitHub Pages.

## Tips

Face a window in daylight, turn off lamps and filters, and pull your hair back. Including white paper in the photo improves accuracy.

## Notes

- Results are a first reading. Cameras shift colour, so confirm your top colours in a mirror in natural light.
- Photos are processed in the browser and never uploaded.
