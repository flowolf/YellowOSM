import {Injectable} from '@angular/core';
import * as elasticsearch from 'elasticsearch-browser';
import {Client} from 'elasticsearch-browser';
import {environment} from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class ElasticsearchService {

  private client: Client;

  constructor() {
    if (!this.client) {
      this._connect();
    }
  }

  private _connect() {
    this.client = new elasticsearch.Client({
      host: environment.elasticSearchBaseUrl,
    });
  }

  isAvailable(): any {
    return this.client.ping({
      requestTimeout: Infinity,
      body: 'hello yosm!'
    });
  }

  fullTextSearch(userQuery: string, topLeft: any, bottomRight: any, center: any): any {
    return this.client.search({
      index: environment.elasticSearchIndex,
      type: '_doc',
      filterPath: ['hits.hits._source', 'hits.total', '_scroll_id'],
      body: {
        'size': 300,
        'query': {
          'bool': {
            'should': [
              {
                'query_string':
                  {
                    'query': userQuery.trim().replace(' ', '* ') + '*',
                    'default_operator': 'AND',
                    'fields': [
                        'labels.name^5',
                        'description^2',
                        'labels.website^3',
                        'labels.contact_website',
                        // 'labels.addr_street',
                        'labels.addr_city',
                        'labels.amenity',
                        'labels.tourism',
                        'labels.sport',
                        'labels.craft',
                        'labels.leisure',
                        'labels.shop',
                        'labels.healthcare',
                        'labels.emergency',
                        'labels.healthcare_speciality'
                    ]
                  }
              }
              // ,{
              //   'query_string':
              //     {
              //       'query': userQuery.trim().replace(' ', '~ ') + '~',
              //       'default_operator': 'AND',
              //       'fields': [
              //           'labels.name^5',
              //           'description^2',
              //           'labels.website^3',
              //           'labels.contact_website',
              //           'labels.addr_street',
              //           'labels.addr_city',
              //           'labels.amenity',
              //           'labels.tourism',
              //           'labels.sport',
              //           'labels.craft',
              //           'labels.leisure',
              //           'labels.shop',
              //           'labels.healthcare',
              //           'labels.emergency',
              //           'labels.healthcare_speciality'
              //       ]
              //     },
              // }
            ],
            'minimum_should_match': 1,
            'filter': {
              'geo_bounding_box': {
                'location': {
                  'top_left': {
                    'lat': topLeft[1],
                    'lon': topLeft[0]
                  },
                  'bottom_right': {
                    'lat': bottomRight[1],
                    'lon': bottomRight[0]
                  }
                }
              }
            }
          }
        }
      }
    });
  }
  //   body: {
  //     'size': 300,
  //     'query': {
  //       'bool': {
  //         'must': {
  //           'multi_match': {
  //             'type': 'cross_fields',
  //             'query':  userQuery.trim().replace(' ', '* ') + '*',
  //             'fields': [
  //               'labels.name^5',
  //               'description^2',
  //               'labels.website^3',
  //               'labels.contact_website',
  //               'labels.website',
  //               'labels.addr_street',
  //               'labels.addr_city',
  //               'labels.amenity',
  //               'labels.tourism',
  //               'labels.sport',
  //               'labels.craft',
  //               'labels.leisure',
  //               'labels.shop',
  //               'labels.healthcare',
  //               'labels.emergency',
  //               'labels.healthcare_speciality'
  //             ]
  //           }
  //         },
  //         'filter': {
  //           'geo_bounding_box': {
  //             'location': {
  //               'top_left': {
  //                 'lat': topLeft[1],
  //                 'lon': topLeft[0]
  //               },
  //               'bottom_right': {
  //                 'lat': bottomRight[1],
  //                 'lon': bottomRight[0]
  //               }
  //             }
  //           }
  //         }
  //       }
  //     }
  //   }
  //   });
  // }

  searchByOsmId(osmId: string): any {
    return this.client.search({
      index: environment.elasticSearchIndex,
      type: '_doc',
      filterPath: ['hits.hits._source', 'hits.total', '_scroll_id'],
      body: {
        'query': {
          'match': {
            'osm_id': osmId
          },
        }
      }
    });
  }

  searchVicinityByProperty(propertyType: string, propertyValue: string, center: any): any {
    const propertyTypeString = 'labels.' + propertyType;
    return this.client.search({
      index: environment.elasticSearchIndex,
      type: '_doc',
      filterPath: ['hits.hits._source', 'hits.total', '_scroll_id'],
      body: {
        'size': 4,
        'query': {
          'bool': {
            'must': [
              {'match': {[propertyTypeString]: propertyValue}}
            ],
            'filter': [{
              'geo_distance': {
                'distance': '10m',
                'location': {
                  'lat': center[1],
                  'lon': center[0]
                }
              }
            }]
          }
        },
        'sort': [
          {
            '_geo_distance': {
              'location': {
                'lat': center[1],
                'lon': center[0]
              },
              'order': 'asc',
              'unit': 'km',
              'distance_type': 'plane'
            }
          }
        ]
      }
    });
  }
}
