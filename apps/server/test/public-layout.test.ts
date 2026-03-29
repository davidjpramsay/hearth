import assert from "node:assert/strict";
import test from "node:test";
import { sanitizeLayoutRecordForPublicDisplay } from "../src/services/public-layout.js";

test("sanitizeLayoutRecordForPublicDisplay redacts calendar URLs and photo folder paths", () => {
  const layout = {
    id: 1,
    name: "Family Dashboard",
    active: true,
    version: 3,
    createdAt: "2026-03-10T00:00:00.000Z",
    updatedAt: "2026-03-10T00:00:00.000Z",
    config: {
      cols: 12,
      rows: 8,
      rowHeight: 40,
      items: [],
      modules: [
        {
          id: "calendar-1",
          moduleId: "calendar",
          title: "Calendar",
          config: {
            viewMode: "list",
            feedSelections: [
              {
                feedId: "school",
                labelOverride: null,
                colorOverride: null,
              },
            ],
            legacyCalendars: [
              {
                source: "webcal://secret.example.com/private-feed-1",
                label: "School",
                color: "#22D3EE",
              },
              {
                source: "webcal://secret.example.com/private-feed-2",
                label: null,
                color: "#60A5FA",
              },
            ],
            daysToShow: 14,
            use24Hour: true,
            refreshIntervalSeconds: 300,
          },
        },
        {
          id: "photos-1",
          moduleId: "photos",
          title: "Photos",
          config: {
            folderPath: "/photos/private/kids",
            collectionId: null,
            intervalSeconds: 20,
            shuffle: true,
            layoutOrientation: "landscape",
          },
        },
      ],
    },
  };

  const sanitized = sanitizeLayoutRecordForPublicDisplay(layout);
  assert.ok(sanitized);
  assert.deepEqual(sanitized.config.modules[0]?.config.feedSelections, [
    {
      feedId: "school",
      labelOverride: null,
      colorOverride: null,
    },
  ]);
  assert.deepEqual(sanitized.config.modules[0]?.config.legacyCalendars, [
    {
      source: "Calendar 1",
      label: "School",
      color: "#22D3EE",
    },
    {
      source: "Calendar 2",
      label: null,
      color: "#60A5FA",
    },
  ]);
  assert.equal(sanitized.config.modules[1]?.config.folderPath, "/photos");
});
