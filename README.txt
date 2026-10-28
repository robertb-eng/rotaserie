ROTASERIE PRODUCT SITE
======================

A standalone two-page website (home and About) that showcases Rotaserie, separate from the app itself.
Plain HTML, CSS and a little JavaScript: no build step, and it works on any web host.

  index.html    home: hero, features, Spiros as proof, FAQ, call to action
  about.html    about us, Spiros, and the founder's story
  styles.css    the design (light and dark mode, phone to wide screen)
  site.js       light/dark switch, fade-in on scroll, tour highlighting, click-to-zoom
  img/          real screenshots of the app (a fictional "Harbor Bistro" demo restaurant)

PREVIEW ON THIS COMPUTER
  Open index.html in a browser, or for the full experience:
      cd ~/Documents/Rotaserie-Site && python3 -m http.server 8000
  then visit http://localhost:8000

BEFORE PUTTING IT ONLINE
  1. Contact email: the "Book a demo" button emails robertebanchero@gmail.com. To change
     it, search index.html for that address.
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
  The images in img/ are WebP files captured from the real app at 1440px (desktop)
  and 390x844 (iPhone). Replace a file with the same name to update it.
