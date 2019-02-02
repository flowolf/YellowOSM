import {ChangeDetectorRef, Component, ElementRef, OnInit, ViewChild} from '@angular/core';

import OlMap from 'ol/Map';
import OlXYZ from 'ol/source/XYZ';
import OlTileLayer from 'ol/layer/Tile';
import OlView from 'ol/View';
import {Vector as VectorLayer} from 'ol/layer';
import VectorSource from 'ol/source/Vector';
import {GeoJSON} from 'ol/format';
import {fromLonLat, toLonLat, transformExtent} from 'ol/proj';
import {getTopLeft, getBottomRight} from 'ol/extent';
import {Circle as CircleStyle, Fill, Icon, Stroke, Style} from 'ol/style';
import {bbox as bboxStrategy} from 'ol/loadingstrategy.js';
import {ElasticsearchService} from '../services/elasticsearch.service';
import Point from 'ol/geom/Point';
import Feature from 'ol/Feature';
import {ATTRIBUTION} from 'ol/source/OSM.js';
import {ActivatedRoute, Params, Router} from '@angular/router';

@Component({
  selector: 'app-yellowmap',
  templateUrl: './yellowmap.component.html',
  styleUrls: ['./yellowmap.component.scss']
})
export class YellowmapComponent implements OnInit {
  map: OlMap;
  source: OlXYZ;
  layer: OlTileLayer;
  esLayer: VectorLayer;
  view: OlView;
  userQuery = '';
  esIsConnected = false;
  esStatus: string;
  esSearchResult = [];
  esSource: VectorSource;
  selection = {};
  selectionDetails = '';
  selectionLabels = {};
  geoLocationLoading = false;
  @ViewChild('searchInput')
  searchInput: ElementRef;
  detailKeys = [
    'Typ',
    'Shop',
    'Möglichkeiten',
    'Adresse',
    'Öffnungszeiten',
    'Website',
    'E-Mail',
    'Telefon'
  ];

  constructor(
    private es: ElasticsearchService,
    private cd: ChangeDetectorRef,
    private router: Router,
    private route: ActivatedRoute
  ) {
    this.esIsConnected = false;
  }

  ngOnInit() {
    this.initElasticsearch();

    this.source = new OlXYZ({
      url: '//maps.wikimedia.org/osm-intl/{z}/{x}/{y}.png',
      attributions: [
        ATTRIBUTION
      ]
    });

    this.layer = new OlTileLayer({
      source: this.source
    });

    this.view = new OlView({
      // center: fromLonLat([15.4395, 47.0707]),
      center: fromLonLat([+this.route.snapshot.paramMap.get('lon'), +this.route.snapshot.paramMap.get('lat')]),
      zoom: +this.route.snapshot.paramMap.get('zoom'),
      maxZoom: 19
    });

    const that = this;

    this.esSource = new VectorSource({
      format: new GeoJSON(),
      loader: function (extent, resolution, projection) {
        that.esSearchResult.forEach(result => {
          const featurething = new Feature({
            name: result['_source']['name'],
            labels: that.parseResults(result['_source']['labels']),
            geometry: new Point(fromLonLat([result['_source']['location'][0], result['_source']['location'][1]]))
          });
          that.esSource.addFeature(featurething);
        });
      },
      strategy: bboxStrategy
    });

    this.esLayer = new VectorLayer({
      source: this.esSource,
      style: function (feature) {
        let color = 'rgba(255, 211, 3, 0.7)';
        if (that.selection.hasOwnProperty('ol_uid') && that.selection['ol_uid'] === feature.ol_uid) {
          color = 'rgba(200,20,20,0.8)';
        }
        return new Style({
          image: new CircleStyle({
            radius: 7,
            fill: new Fill({
              color: color
            }),
            stroke: new Stroke({
              color: 'rgba(0,0,0,1)', width: 2.5
            })
          })
        });
      },
      strategy: bboxStrategy
    });

    this.map = new OlMap({
      target: 'map',
      layers: [
        this.layer,
        this.esLayer
      ],
      view: this.view
    });

    this.map.on('click', function (event) {
      that.searchInput.nativeElement.blur();
      const features = that.map.getFeaturesAtPixel(event.pixel);
      if (!features) {
        that.selection = {};
        that.selectionDetails = '';
        that.selectionLabels = {};
      } else {
        that.selection = features[0];
        that.selectionDetails = features[0].values_['name'];
        that.selectionLabels = features[0].values_['labels'];
      }

      // force redraw
      that.esLayer.setStyle(that.esLayer.getStyle());
    });

    this.map.on('moveend', function (evt) {
      // that.searchInput.nativeElement.blur(); // breaks Android browsers
      that.clearSearchAndSelection();
      that.searchElasticSearch();
      that.updateUrl(evt);
    });

    this.view.on('change:resolution', function (evt) {
      that.updateUrl(evt);
    });
  }

  updateUrl(evt) {
    const center = toLonLat(this.view.getCenter());
    const zoom = this.view.getZoom();
    this.router.navigate(
      ['map', center[0], center[1], zoom],
      {replaceUrl: true}
      );
  }

  parseResults(labels: any) {
    const getLabel = function (label) {
      return labels[label] || '';
    };

    const capitalizeFirstLetter = function (string) {
      return string.charAt(0).toUpperCase() + string.slice(1);
    };

    const website = getLabel('website');
    const contactWebsite = getLabel('contact_website');
    const email = getLabel('email');
    const contactEmail = getLabel('contact_email');
    const phone = getLabel('phone');
    const contactPhone = getLabel('contact_phone');

    const result = {
      'Typ': capitalizeFirstLetter(getLabel('amenity')),
      'Möglichkeiten': getLabel('leisure') + getLabel('sport') + getLabel('tourism'),
      'Shop': getLabel('shop'),
      'Adresse': getLabel('addr_street') + ' ' + getLabel('addr_housenumber') + ' ' +
        getLabel('addr_postcode') + ' ' + getLabel('addr_city'),
      'Öffnungszeiten': getLabel('opening_hours'),
      'Web': (contactWebsite ? '<a href="' + contactWebsite + '" target="_blank">' + contactWebsite + '</a>' :
        (website ? '<a href="' + website + '" target="_blank">' + website + '</a>' : '')),
      'E-Mail': (email ? '<a href="mailto:' + email + '">' + email + '</a> ' :
        (contactEmail ? '<a href="mailto:' + contactEmail + '">' + contactEmail + '</a> ' : '')),
      'Telefon': (phone ? '<a href="tel:' + phone + '">' + phone + '</a> ' :
        (contactPhone ? '<a href="tel:' + contactPhone + '">' + contactPhone + '</a> ' : '')),
    };

    const filtered = Object.keys(result)
      .filter(key => /\S/.test(result[key]))
      .reduce((obj, key) => {
        return {
          ...obj,
          [key]: result[key]
        };
      }, {});
    return filtered;
  }

  search() {
    this.searchElasticSearch();
  }

  private initElasticsearch() {
    this.es.isAvailable().then(() => {
      this.esStatus = 'OK';
      this.esIsConnected = true;
    }, error => {
      this.esStatus = 'Fehler beim Verbinden';
      this.esIsConnected = false;
      console.error('Server is down', error);
    }).then(() => {
      this.cd.detectChanges();
    });
  }

  private searchElasticSearch() {
    if (this.userQuery.length < 2) {
      this.clearSearchAndSelection();
      return;
    }

    const extent = this.view.calculateExtent(this.map.getSize());
    const topLeft = toLonLat(getTopLeft(extent));
    const bottomRight = toLonLat(getBottomRight(extent));
    const center = toLonLat(this.view.getCenter());

    this.es.fullTextSearch(this.userQuery, topLeft, bottomRight, center).then((result) => {
      this.esStatus = 'OK';
      console.log(result);
      if (result !== null && result.hits.total > 0) {
        this.esSearchResult = result['hits']['hits'];
        this.esLayer.getSource().clear();
        this.esLayer.getSource().refresh();
      } else {
        this.clearSearchAndSelection();
      }
    }, error => {
      this.esStatus = 'Fehler in der Suche';
      this.clearSearchAndSelection();
      console.error('Server is down', error);
    }).then(() => {
      this.cd.detectChanges();
    });
  }

  private clearSearchAndSelection() {
    this.esSearchResult = [];
    this.selectionDetails = '';
    this.esLayer.getSource().clear();
    this.esLayer.getSource().refresh();
  }

  public getLocation() {
    const that = this;
    this.geoLocationLoading = true;
    navigator.geolocation.getCurrentPosition(function (pos) {
        const coords = fromLonLat([pos.coords.longitude, pos.coords.latitude]);
        that.map.getView().animate({center: coords});
        that.geoLocationLoading = false;
      }, function error(err) {
        console.warn(`ERROR(${err.code}): ${err.message}`);
        that.geoLocationLoading = false;
      }
    );
  }
}
