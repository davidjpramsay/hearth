import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import { docsSidebar } from "./src/generated/starlight-sidebar.mjs";

export default defineConfig({
  site: "https://davidjpramsay.github.io",
  base: "/hearth",
  integrations: [
    starlight({
      title: "Hearth Docs",
      description:
        "Install, operate, and extend Hearth with a standard public developer docs site.",
      customCss: ["./src/styles/starlight.css"],
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/davidjpramsay/hearth",
        },
      ],
      editLink: {
        baseUrl: "https://github.com/davidjpramsay/hearth/edit/main/apps/docs/",
      },
      sidebar: docsSidebar,
    }),
  ],
});
