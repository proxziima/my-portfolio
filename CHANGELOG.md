# Changelog

## 0.0.1 (2026-10-07)


### Features

* **cms:** a company in use by experiences cannot be deleted ([b05fef8](https://github.com/proxziima/my-portfolio/commit/b05fef84ff2b72d5eb3ad46f6188a168ac24ad9d))
* **cms:** Companies collection referenced by experiences, projects and a bio record link ([9284836](https://github.com/proxziima/my-portfolio/commit/92848360ef3d8d3e5b66d95cecc3afc94a642790))
* **cms:** companies migration carries experiences and bio chip links over; favicons:refresh backfills icons ([eec78eb](https://github.com/proxziima/my-portfolio/commit/eec78eb94da63c93cc286a27ccd56ff0f491c862))
* **cms:** discover a site's favicon from its declared icons or /favicon.ico ([4b152ec](https://github.com/proxziima/my-portfolio/commit/4b152ec44bc3931d80e0c57a2f9087089a21922c))
* **cms:** seed companies and link them and projects from the bios ([4d85626](https://github.com/proxziima/my-portfolio/commit/4d85626c811a614df4f0b425a128f9346fcd5519))
* **cms:** self-hosted favicons kept in step with a record's url ([781e589](https://github.com/proxziima/my-portfolio/commit/781e5893135a81b8d882ed49c48f4bc14f630007))
* **cms:** stricterTier combines two disclosure tiers ([41e0d9b](https://github.com/proxziima/my-portfolio/commit/41e0d9bdb02d8718832dce0ac6ef9519d6cd1f41))
* **cms:** SVG favicons are rasterized to PNG so sites with only an SVG icon get one ([c56dc3f](https://github.com/proxziima/my-portfolio/commit/c56dc3f4c2fb8f9bb19ebcd28a77dc6f21e65f75))
* **cms:** the twin names companies from the collection and caps rows by their company's tier ([c8092f8](https://github.com/proxziima/my-portfolio/commit/c8092f873a25527e9875d7bbddf60de9dd0d71e8))
* **web:** /api/health reports the image's commit for the deploy smoke test ([d1d1bfb](https://github.com/proxziima/my-portfolio/commit/d1d1bfb46591e0b315f711dcada99e10dcdc78e3))
* **web:** chip links show a logo or favicon image in the chip slot ([3524411](https://github.com/proxziima/my-portfolio/commit/3524411e3f59f0599c4930da7d067616785376da))
* **web:** experiences, projects and bio links resolve companies and projects through one lookup ([9faf5a8](https://github.com/proxziima/my-portfolio/commit/9faf5a8ad8ec4d5349fa0f9ab3ed715c8bdebb17))


### Bug Fixes

* **agents,os:** the booking widget always follows the answer ([522ef19](https://github.com/proxziima/my-portfolio/commit/522ef191d6ecc712bbfc82d3f565573329874f8e))
* **agents:** classifiers use Anthropic/DeepSeek/OpenAI models only, chosen by benchmark ([4d8fb34](https://github.com/proxziima/my-portfolio/commit/4d8fb345a209c9576392035c83cf87f7f4f550d5))
* **agents:** ignore iMessage events with no text, which looped on receipts ([bf603e9](https://github.com/proxziima/my-portfolio/commit/bf603e90f5b7182982d7b07c7eb7ba38b860d6bc))
* **agents:** one intent label can no longer force the booking widget ([999bd60](https://github.com/proxziima/my-portfolio/commit/999bd60bba8e8b75e095829534a443faf942711a))
* **agents:** the intent label tells "tell me more" from "let's talk", model chosen by benchmark ([c5b323e](https://github.com/proxziima/my-portfolio/commit/c5b323e8fa8a5f71b6e806d4dda09d39466489bb))
* **cms:** a company or project linked from a bio can't be hidden or deleted ([b2b0302](https://github.com/proxziima/my-portfolio/commit/b2b03024b0c3da4392f61dc1008ba180ed9c99f6))
* **cms:** bound favicon discovery and accept raster icons only ([1206c6c](https://github.com/proxziima/my-portfolio/commit/1206c6cf5f79ab99e4e5b0c1d05d3fcf2345b68d))
* **cms:** companies migration is atomic, links only public records and keeps project urls ([a74e5e2](https://github.com/proxziima/my-portfolio/commit/a74e5e23d1c47a9048f21abb808f194a2117d731))
* **cms:** favicons are decided by content and re-encoded to PNG, with gzip, complexity and time bounds ([3f0500d](https://github.com/proxziima/my-portfolio/commit/3f0500d6c666ff886e4003f63e797c14336f821f))
* **cms:** favicons render in a killable child process with time and memory caps; SVG URLs are allow-listed and ICO headers validated ([e7ffe91](https://github.com/proxziima/my-portfolio/commit/e7ffe91216c7d58f150eb49fd9632d61b0fffc8e))
* **cms:** favicons stay private to public records: neutral file names, anonymous reads limited to public owners, no API writes; unknown tiers fail closed ([cd4d61c](https://github.com/proxziima/my-portfolio/commit/cd4d61c7fd7306f3199e1f9fb026d782e62f912e))
* **cms:** persist favicons after the record is saved and never fail the save ([563f756](https://github.com/proxziima/my-portfolio/commit/563f756fc1830acd1aab64dadccdc0f9df3793a7))
* **cms:** SVG favicons render at a density that fits their declared size ([5d2deac](https://github.com/proxziima/my-portfolio/commit/5d2deac5687f50e17b6f3603c3a293a2f5cc87d2))
* **cms:** SVG ids hidden in a DOCTYPE literal still count ([9825885](https://github.com/proxziima/my-portfolio/commit/982588590d7e26b8cc6a0f7d80d3b7d1c41150d6))
* **cms:** the favicon hook reads the stored record when the response was trimmed ([5bbe4f0](https://github.com/proxziima/my-portfolio/commit/5bbe4f0503d258c82b81ee6262812fb8690d3a31))
* **cms:** the favicon renderer dies at its memory cap and runs with a minimal environment ([bd5ef28](https://github.com/proxziima/my-portfolio/commit/bd5ef287d06b6f94048814ad4e83bf202b01ee84))
* **cms:** the SVG pre-check runs in linear time ([aae37bc](https://github.com/proxziima/my-portfolio/commit/aae37bcbbdd52989dec3a2a8ddb6c9cf61de4dc3))
* **cms:** the twin never names a non-public company outside an approved disclosure ([a2e790b](https://github.com/proxziima/my-portfolio/commit/a2e790b2ce59afb3286b8e9ab182642dfa802aed))
* **web:** the role picker is wide enough that the level label never wraps ([b63312e](https://github.com/proxziima/my-portfolio/commit/b63312ecd93497dee4ef4678700961f044e394b3))
* **web:** the webhook forwarder relays bodiless acks instead of turning them into 500s ([4e1efaf](https://github.com/proxziima/my-portfolio/commit/4e1efaf66edfe31760981b9aa63830387f6ac62d))
