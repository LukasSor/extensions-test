/**
 * Companion engine for the Full Map search-result tab: holds the Tripadvisor
 * Content API key under Settings → Engines (same flow as other plugin engines).
 * executeSearch returns no rows — settings only; not a web search engine.
 */
export const type = "maps";
export const outgoingHosts = [
  "api.content.tripadvisor.com",
  "static.tacdn.com",
  "www.tripadvisor.com",
  "tripadvisor.com",
];
export const disabledByDefault = true;

export default class FullMapTripadvisorEngine {
  name = "Full Map (Tripadvisor)";

  settingsSchema = [
    {
      key: "tripadvisorApiKey",
      label: "Tripadvisor Content API key",
      type: "password",
      secret: true,
      placeholder: "Optional — ratings & review counts (5000 free calls/mo tier)",
      description:
        "Register at https://www.tripadvisor.com/developers — Content API key. The Full Map tab reads this value (engine id engine-full-map-tripadvisor). Up to the first 8 map results per page: 2 API calls each when not cached. Cached on disk (~30 days). Follow Tripadvisor display rules in the map panel.",
    },
  ];

  configure(settings) {
    this._tripadvisorApiKey =
      typeof settings?.tripadvisorApiKey === "string"
        ? settings.tripadvisorApiKey.trim()
        : "";
  }

  async executeSearch(_query, _page, _timeFilter, _context) {
    return [];
  }
}
