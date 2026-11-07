ROTASERIE PRODUCT SITE
======================

A standalone two-page website (home and About) that showcases Rotaserie, separate from the app itself.
Plain HTML, CSS and a little JavaScript: no build step, and it works on any web host.

  index.html    home: Type to Build demo, See it work (walkthrough clips), managers, staff, owners, kinds of business, Spiros, FAQ, Get early access
  about.html    about us, Spiros, and the founder's story
  styles.css    the design (light and dark mode, phone to wide screen)
  site.js       light/dark switch, fade-in on scroll, the Type to Build demo, the walkthrough player, early access form, click-to-zoom
                (SIGNUP_URL at the top: set it to https://app.rotaserie.com/signup when signup opens)
  fonts/        the app's fonts (Atkinson Hyperlegible Next, Newsreader), self-hosted: no Google Fonts
  img/tour/     walkthrough clips: <clip>-<light|dark>.webm/.mp4 and -poster.webp (ttb, publish, fill, staff)
  img/new/      real screenshots of the app, light and dark (the fictional "Harbor Street Bistro" demo)

PREVIEW ON THIS COMPUTER
  Open index.html in a browser, or for the full experience:
      cd ~/Documents/Rotaserie-Site && python3 -m http.server 8000
  then visit http://localhost:8000

BEFORE PUTTING IT ONLINE
  1. Contact email: "Get early access" emails robertebanchero@gmail.com (site.js EMAIL, and
     the mailto links in index.html).
  2. The name: Rotaserie by Spiros. rotaserie.com was unregistered in October 2026 - register it
     before someone else does, and search the trademark register (tmsearch.uspto.gov).
  3. Pricing: the FAQ says "get in touch" - add real pricing when you have it.

HOSTING IT FOR FREE (any one of these)
  - Render: New > Static Site, point it at a GitHub repo holding this folder; publish
    directory "." (no build command).
  - Netlify or Cloudflare Pages: drag this folder onto their "deploy" page.
  - GitHub Pages: push this folder to a repo and turn on Pages in its settings.
  Then point your own domain at it in that service's settings.

UPDATING SCREENSHOTS
  The images in img/new/ are WebP files captured from the real app at 1280x800 (desktop)
  and 390x844 at 2x (phone), each in light (_light) and dark (_dark). Replace a file with
  the same name to update it. Every claim on the pages was checked against the app's code
  (Nov 7 2026): re-check when a feature changes.

WALKTHROUGH CLIPS
  img/tour/ holds four clips recorded from the real app (demo business, sample data set up per clip),
  phone 780x1688 and computer 1600x1024, each light and dark: WebM (VP9) + MP4 (H.264) + a WebP poster
  taken from the middle of the clip. They're recorded with the app's private screenshot tools (see the
  notes); the Fill clip is recorded on its own, after the others. Retake them, and the screenshots, when the app's look
  or these features change; keep the captions in index.html true for every business's settings.
