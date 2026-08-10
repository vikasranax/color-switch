# Color Switch Blast

A modern HTML5 arcade game built for web and YouTube Playables-style publishing.

## Gameplay

Switch your ball color to match incoming beams.

- Match the beam to pass
- Wrong color ends the run
- Perfect timing gives bonus score
- Combo increases score multiplier

## Controls

### Mobile

Tap anywhere to switch color.

### Desktop

- Space / Click / Enter / Arrow Up: switch color
- P: pause
- M: sound toggle
- F: effects toggle

## Files

- `index.html` — game entry
- `style.css` — styles and loader
- `game.js` — main game logic
- `playables.js` — YouTube Playables SDK adapter bridge

## YouTube Playables Integration

If YouTube provides an official SDK script tag, paste it inside `index.html` where marked.

The `playables.js` adapter attempts to detect common SDK globals and connect:

- pause
- resume
- restart
- game ready
- game start
- game over
- score reporting

## Local Development

Open `index.html` in a browser.

Or run a local server:

```bash
python -m http.server 8080