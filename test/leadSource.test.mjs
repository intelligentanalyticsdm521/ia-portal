// "Source · via Channel" (post-capture L9) once Intake connectors exist.
//
// The invariant: what a lead SAYS it is comes from the row when the row knows,
// and only falls back to a map when it does not. A client who names a Google
// Ads form "Spring tune-up" must see "Spring tune-up", not "Google Ads lead
// form" — otherwise the inbox cannot tell two of their forms apart, which is
// the entire reason they were asked to name it.
//
// And the Source FACET groups by the source KEY, never by that name: ten forms
// on one platform are one filter chip. Group by the label and a client with a
// form per campaign gets a filter row longer than the inbox.
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  sourceLabel, channelLabel, sourceAndChannel,
  rowSourceLabel, rowChannelLabel, rowSourceAndChannel,
  sourceFacetKey, sourceFacetLabel,
} from "../src/lib/leadSource";

test("a B2B search lead still reads exactly as it did", () => {
  assert.equal(sourceLabel("spark_leadgen"), "SPARK Lead Gen");
  assert.equal(channelLabel("spark_leadgen"), "B2B search");
  assert.equal(sourceAndChannel("spark_leadgen"), "SPARK Lead Gen · via B2B search");
  // the column may hold a JSON array
  assert.equal(sourceAndChannel('["brave_search","you_search"]'), "SPARK Lead Gen · via B2B search");
  assert.equal(sourceLabel(null), "—");
});

test("every Intake provider has a name a client would recognise", () => {
  for (const [key, expected] of [
    ["google_ads_leadform", ["Google Ads lead form", "Google Ads"]],
    ["google_lsa", ["Local Services Ads", "Google Local Services"]],
    ["meta_leadform", ["Facebook lead form", "Facebook"]],
    ["gbp_call", ["Google Business Profile", "Google Business Profile"]],
    ["yelp", ["Yelp", "Yelp"]],
    ["angi", ["Angi", "Angi"]],
    ["houzz", ["Houzz", "Houzz"]],
    ["bark", ["Bark", "Bark"]],
  ]) {
    assert.equal(sourceLabel(key), expected[0], key);
    assert.equal(channelLabel(key), expected[1], key);
  }
});

test("the row's own words win over the map", () => {
  const lead = {
    source: "google_ads_leadform",
    source_label: "Spring tune-up lead form",
    channel: "Google Ads",
  };
  assert.equal(rowSourceLabel(lead), "Spring tune-up lead form");
  assert.equal(rowChannelLabel(lead), "Google Ads");
  assert.equal(rowSourceAndChannel(lead), "Spring tune-up lead form · via Google Ads");
});

test("a row with no label of its own falls back to the map", () => {
  const lead = { source: "google_ads_leadform", source_label: null, channel: null };
  assert.equal(rowSourceAndChannel(lead), "Google Ads lead form · via Google Ads");
});

test("a blank label is not a label", () => {
  const lead = { source: "google_ads_leadform", source_label: "   ", channel: "  " };
  assert.equal(rowSourceAndChannel(lead), "Google Ads lead form · via Google Ads",
    "whitespace must not blank out the row");
});

test("a B2B search row is unaffected by the new columns", () => {
  assert.equal(rowSourceAndChannel({ source: "spark_leadgen" }), "SPARK Lead Gen · via B2B search");
  assert.equal(rowSourceAndChannel({ sources_found: '["hunter_discover"]' }), "SPARK Lead Gen · via B2B search");
});

test("a source with no channel shows the source alone, never a dangling separator", () => {
  assert.equal(rowSourceAndChannel({ source: "import" }), "Import");
  assert.equal(rowSourceAndChannel({ source: "import", source_label: "Q3 spreadsheet" }), "Q3 spreadsheet");
});

test("an unknown row degrades to a dash, never to \"undefined\"", () => {
  assert.equal(rowSourceAndChannel(null), "—");
  assert.equal(rowSourceAndChannel({}), "—");
  assert.equal(rowSourceLabel({ source: "some_future_source" }), "some_future_source",
    "an unmapped key shows itself rather than pretending to be something else");
});

test("the Source facet groups by the KEY, not by what the client named it", () => {
  const leads = [
    { source: "google_ads_leadform", source_label: "Spring tune-up" },
    { source: "google_ads_leadform", source_label: "Roof replacement" },
    { source: "google_ads_leadform", source_label: "Gutter guards" },
    { source: "spark_leadgen" },
    { source: null },
  ];
  const keys = leads.map(sourceFacetKey);
  assert.deepEqual(keys, [
    "google_ads_leadform", "google_ads_leadform", "google_ads_leadform",
    "spark_leadgen", "unknown",
  ]);
  const distinct = [...new Set(keys)];
  assert.equal(distinct.length, 3, "three Google Ads forms are ONE chip");
  assert.equal(sourceFacetLabel("google_ads_leadform"), "Google Ads lead form");
  assert.equal(sourceFacetLabel("unknown"), "Unknown");
});

test("nothing a client reads says \"tenant\"", () => {
  const everything = [
    ...["spark_leadgen", "google_ads_leadform", "google_lsa", "meta_leadform", "gbp_call", "yelp", "angi", "houzz", "bark", "import"]
      .flatMap((k) => [sourceLabel(k), channelLabel(k) || "", sourceFacetLabel(k)]),
    rowSourceAndChannel({ source: "google_ads_leadform", source_label: "Spring tune-up", channel: "Google Ads" }),
  ].join(" ");
  assert.ok(!/tenant/i.test(everything), everything);
});
