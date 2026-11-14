ROTASERIE PRODUCT SITE
======================

The website for Rotaserie, separate from the app itself. Plain HTML, CSS and a little JavaScript. The pages are
built from _src/ by a small Python script (standard library only) and the built pages are committed, so any web host
can serve the folder as is.

BUILDING THE PAGES
  Edit the sources in _src/, never the built .html files in this folder:
      _src/layout.html      the page around the content: head, top bar, footer
      _src/partials/        pieces the layout pulls in (the two top bars)
      _src/pages/           one file per page: settings in a <!--meta ... --> block, then the page's content
      _src/site.json        defaults for every page
  Then:
      python3 _build/build.py           writes the pages and sitemap.xml
      python3 _build/build.py --check   fails if a built page is out of date (run before every push)
  Terms and Privacy come from the app: run the app's tools/export_legal.py, then
      python3 _build/build.py --import-legal

  tokens.css    the app's colours, type, shapes and motion, copied from the app's stylesheet
  robots.txt, sitemap.xml   for search engines (sitemap.xml is written by the build)

  index.html    home: Type to Build demo, See it work (walkthrough clips), managers, staff, owners, kinds of business, Spiros, FAQ, Get early access
  about.html    about us, Spiros, and the founder's story
  styles.css    the design (light and dark mode, phone to wide screen)
  site.js       light/dark switch, fade-in on scroll, the Type to Build demo, the walkthrough player, early access form, click-to-zoom
                (SIGNUP_URL at the top: set it to https://app.rotaserie.com/signup when signup opens)
  fonts/        the app's fonts (Atkinson Hyperlegible Next and Mono; Newsreader until the new look), self-hosted:
                no Google Fonts. Licenses in fonts/OFL.txt
  img/tour/     walkthrough clips: <clip>-<light|dark>.webm/.mp4 and -poster.webp (ttb, publish, fill, staff)
  img/new/      real screenshots of the app, light and dark (the fictional "Harbor Street Bistro" demo)
  img/app/      real screenshots of the app's current look: <shot>-<en|es>-<light|dark>-<pixel width>.webp/.avif
                (the same made-up demo business; phones at 3x and 2x, computer screens at 2x and 1x)

PREVIEW ON THIS COMPUTER
  Open index.html in a browser, or for the full experience serve the folder on a free port:
      cd ~/Documents/Rotaserie-Site && python3 -m http.server 8000
  then visit http://localhost:8000

BEFORE PUTTING IT ONLINE
  1. Contact email: "Get early access" emails robert@rotaserie.com (site.js EMAIL, and
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
