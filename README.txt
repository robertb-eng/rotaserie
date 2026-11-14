ROTASERIE PRODUCT SITE
======================

The website for Rotaserie, separate from the app itself. Plain HTML, CSS and a little JavaScript. The pages are
built from _src/ by a small Python script (standard library only) and the built pages are committed, so any web host
can serve the folder as is. Nothing runs on GitHub: every build, test and check below runs on your own computer.

BUILDING THE PAGES
  Edit the sources in _src/, never the built .html files in this folder:
      _src/strings.en.json  every word on the pages, by section (one file per language)
      _src/layout.html      the page around the content: head, top bar, footer
      _src/partials/        pieces the layout and pages pull in (top bar, footer, the Type to Build pane)
      _src/pages/           one file per page: settings in a <!--meta ... --> block, then the page's content
      _src/site.json        settings for every page, and the switches (below)
      _src/generated/       written by _build/prerender.js: don't edit by hand
  Then:
      node _build/prerender.js          only after changing a Type to Build example, demo/ or vendor/typebuild.js
      python3 _build/build.py           writes the pages and sitemap.xml
      python3 _build/build.py --check   fails if a built page is out of date (run before every push)
      node _tests/ttb.test.js           the Type to Build tests
  Terms and Privacy come from the app: run the app's tools/export_legal.py, then
      python3 _build/build.py --import-legal

SWITCHES (_src/site.json)
  pricing      false until the price is public. When true, the Pricing section and its top-bar link appear; their
               words are read from _src/partials/pricing.html and the strings file, which must exist first.
  ttb_live     true: visitors can type in the Type to Build pane. false: the pane shows its starting example only.
  langs        the languages built. The first is served at /, each other one in its own folder (/es/).
  SIGNUP_URL   at the top of site.js. While empty, the call-to-action buttons open an email to Robert; set it to the
               signup address when signup opens and every button and the form go there instead.

WHAT'S HERE
  index.html    home: Type to Build (live), the film, how it reads a line, for owners, the swap, for staff,
                every screen, Spiros, questions, early access
  about.html    about us, Spiros, and the founder's story
  facts.html    what Rotaserie does and doesn't do, one checked line each (the app's tools/check_facts.py reads it)
  terms.html, privacy.html   exported from the app
  tokens.css    the app's colours, type, shapes and motion, copied from the app's stylesheet: change a value there
                and only there
  styles.css    the layout and components (light and dark, phone to wide screen)
  site.js       light/dark switch, the phone menu, the film player, early access form, screenshot zoom
  demo/         Try Type to Build: state.js (the made-up sample week), read.js (reads and draws), ttb.js (the pane)
  vendor/       typebuild.js: the app's own Type to Build parser, copied byte for byte (never edit it here);
                typebuild.version records the app commit and the file's SHA-256
  fonts/        the app's fonts (Atkinson Hyperlegible Next and Mono), self-hosted. Licenses in fonts/OFL.txt
  img/app/      real screenshots of the app with the made-up "Harbor Street Bistro" demo:
                <screen>-<en|es>-<light|dark>-<pixel width>.webp and .avif
  img/film/     the film, its posters, captions (WebVTT) and chapter times
  robots.txt, sitemap.xml, llms.txt   for search engines and assistants (sitemap.xml is written by the build)

PREVIEW ON THIS COMPUTER
      python3 -m http.server 8000 --bind 127.0.0.1
  then visit http://localhost:8000

RULES FOR EVERY CHANGE
  1. Every line about the product must be true of the app today. facts.html is checked by the app's
     tools/check_facts.py; keep the home page to the same claims.
  2. Screenshots show made-up people only (the demo team), never real staff.
  3. This repository is public, on every branch: no drafts of prices or unannounced wording.
  4. Keep the system: radii of 2, 4 and 6px, three shadows, the type sizes in tokens.css, an 8px grid.

UPDATING THE PARSER COPY
  Copy the app's static/typebuild.js over vendor/typebuild.js, update vendor/typebuild.version (commit and SHA-256),
  then run node _build/prerender.js, node _tests/ttb.test.js --update (read the changes it records) and the build.
  ROTASERIE_APP=<app checkout> node _tests/ttb.test.js checks the copy is identical to that checkout's.
