import { defineConfig } from "wxt";

// See https://wxt.dev/api/config.html
export default defineConfig({
  srcDir: "src",
  modules: ["@wxt-dev/module-svelte"],
  manifest: {
    browser_specific_settings: {
      gecko: {
        id: "satisfactory-calculator@wxt",
      },
    },
    permissions: ["storage", "activeTab", "scripting", "<all_urls>"],
  },
});
