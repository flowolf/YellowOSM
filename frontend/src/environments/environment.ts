// This file can be replaced during build by using the `fileReplacements` array.
// `ng build --prod` replaces `environment.ts` with `environment.prod.ts`.
// The list of file replacements can be found in `angular.json`.

export const environment = {
  production: false,
  localDevEnv: true,
  elasticSearchBaseUrl: 'https://es.yosm.at',
  elasticSearchIndex: 'yosm_dev',
  // no label standard tile
  // tileServerURL: '//tiles.wmflabs.org/osm-no-labels/{z}/{x}/{y}.png',

  tileServerURLs: [
    {'label': 'Wikimedia', 'url': '//maps.wikimedia.org/osm-intl/{z}/{x}/{y}.png', 'attribution': '© <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors'},
    {'label': 'HOT', 'url': '//a.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png', 'attribution': '© TEST 1 <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors'},
    {'label': 'schwarz/weiß', 'url': '//a.tile.stamen.com/toner/{z}/{x}/{y}.png', 'attribution': '© TEST 2 <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors'},
  ],

  // bergfex (not sure if ok to use)
  // tileServerURL: '//maps.bergfex.at/osm/512px/{z}/{x}/{y}.jpg',

  // cartodb (hard to read)
  // tileServerURL: '//cartodb-basemaps-{a-d}.global.ssl.fastly.net/light_all/{z}/{x}/{y}.png',

  // HOT:
  // tileServerURL: '//a.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png',

  // b/w
  // tileServerURL: '//a.tile.stamen.com/toner/{z}/{x}/{y}.png',

  // Stamen no SSL:
  // tileServerURL: '//a.tile.stamen.com/toner/{z}/{x}/{y}.png',

  // osm.de:
  // tileServerURL: '//d.tile.openstreetmap.de/tiles/osmde/{z}/{x}/{y}.png',
  apiBaseUrl: '//localhost:5000/api',
  shortLinkBaseUrl: 'https://dev.yosm.at/s',
  matomoBaseUrl: '//matomo.yosm.at/',
  matomoWebsiteId: 3
};

/*
 * For easier debugging in development mode, you can import the following file
 * to ignore zone related error stack frames such as `zone.run`, `zoneDelegate.invokeTask`.
 *
 * This import should be commented out in production mode because it will have a negative impact
 * on performance if an error is thrown.
 */
// import 'zone.js/dist/zone-error';  // Included with Angular CLI.
