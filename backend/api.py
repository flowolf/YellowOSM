import time
import json
import logging
import os
import urllib.parse

import requests
import responder
from dotenv import load_dotenv
import geoip2.database

from lib.geo58 import Geo58

logger = logging.getLogger("api")


# logger.setLevel(logging.DEBUG)
# with no handlers:
logging.basicConfig(level=logging.DEBUG, format="%(message)s")

load_dotenv()
DEBUG = os.getenv("DEBUG", default=False)
SHORT_URL_REDIRECT_URL = os.getenv("SHORT_URL_REDIRECT_URL")
DEFAULT_ZOOM_LEVEL = os.getenv("DEFAULT_ZOOM_LEVEL", default=19)
ES_URL = os.getenv("ES_URL")
ES_INDEX = os.getenv("ES_INDEX", default="yosm")

api = responder.API(
    debug=DEBUG,
    version="0.2b",
    cors=True,
    cors_params={
        "allow_origins": ["*"],
        "allow_methods": ["*"],
        "allow_headers": ["*"],
    },
)


logger.info("debug: " + DEBUG)
if DEBUG:
    logger.setLevel("DEBUG")
logger.debug("short url: " + SHORT_URL_REDIRECT_URL)


@api.route("/api/")
@api.route("/api/hello")
def hello_world(req, resp):
    resp.text = "Hello World!"


@api.route("/api/expensive-task")
async def handle_task(req, resp):
    @api.background.task
    def process_data(data):
        """This can take some time"""
        print("starting background task...")
        time.sleep(5)
        print("finished background task...")

    # parse incoming data form-encoded
    # json and yaml automatically work
    try:
        data = await req.media()
    except json.decoder.JSONDecodeError:
        data = None
        pass

    process_data(data)

    resp.media = {"success": True}


@api.route("/api/coords_to_geo58/{zoom}/{x}/{y}")
async def convertCoordsToGeo58(req, resp, *, zoom, x, y):
    try:
        g58 = Geo58(zoom=zoom, lat=x, lon=y.strip(" /"))
    except Geo58.Geo58Exception as ex:
        logger.debug(
            "Error: coords_to_geo58: Not Acceptable: coordinates invalid. [%s]", ex
        )
        resp.status_code = 406
        resp.text = "Error: Not Acceptable: coordinates invalid. [{}]".format(ex)
        return
    resp.media = {"geo58": g58.get_geo58()}


@api.route("/api/geo58_to_coords/{geo58_str}")
async def convertGeo58ToCoords(req, resp, *, geo58_str):
    try:
        g58 = Geo58(g58=geo58_str)
    except Geo58.Geo58Exception as ex:
        logger.debug("Error: geo58_to_coords: invalid short code: %s", ex)
        resp.status_code = 400
        resp.text = "Error: Bad Request: invalid short code. [{}]".format(ex)
        return
    zoom, x, y = g58.get_coordinates()
    resp.media = {"zoom": zoom, "x": x, "y": y}


@api.route("/api/redirect_geo58/")
async def convertGeo58ToCoordsEmpty(req, resp):
    """redirect to map without coords"""
    redir_url = "/".join(SHORT_URL_REDIRECT_URL.split("/")[:-3])
    logger.debug("redirect to --> %s", redir_url)
    resp.status_code = 301
    resp.headers["Location"] = redir_url


@api.route("/api/redirect_geo58/{geo58_str}")
async def redirect_geo58(req, resp, *, geo58_str):
    geo58_str = str(geo58_str)
    index = geo58_str.find(";", 0, 12)
    appendix = "" if index == -1 else str(geo58_str[index:])
    geo58 = geo58_str if index == -1 else geo58_str[:index]
    try:
        g58 = Geo58(g58=geo58)
    except Geo58.Geo58Exception as ex:
        logger.debug("redirect_geo58: invalid short code: %s", ex)
        resp.status_code = 400
        resp.text = "Error: Bad Request: invalid short code. [{}]".format(ex)
        return
    zoom, x, y = g58.get_coordinates()
    zoom = DEFAULT_ZOOM_LEVEL if zoom == 20 else zoom
    if not SHORT_URL_REDIRECT_URL:
        logger.error(
            "ERROR: no short url redirect url found! (add SHORT_URL_REDIRECT_URL to env)"
        )
        raise ValueError(
            "ERROR: no short url redirect url found! (add SHORT_URL_REDIRECT_URL to env)"
        )
    logger.debug((SHORT_URL_REDIRECT_URL, zoom, x, y, appendix))
    redir_url = SHORT_URL_REDIRECT_URL.format(zoom=zoom, x=x, y=y) + appendix
    logger.debug("redirect to --> %s", redir_url)
    resp.status_code = 302
    resp.headers["Location"] = redir_url


async def get_poi_info(req, resp, osm_id):
    url = ES_URL + "/" + ES_INDEX + "/_search"
    es_query = json.dumps(
        {
            "size": 1,
            "query": {
                "bool": {
                    "should": [
                        {"query_string": {"query": osm_id, "fields": ["labels.osm_id"]}}
                    ],
                    "minimum_should_match": 1,
                }
            },
        }
    )
    try:
        r = requests.get(
            url, data=es_query, headers={"Content-Type": "application/json"}
        )
    except (ConnectionError, requests.exceptions.ConnectionError) as ex:
        resp.text = "error: could not connect to database."
        resp.status_code = 504
        logger.error(ex)
    if json.loads(r.text)["hits"]["total"]["value"] == 0:
        resp.status_code = 404
        resp.text = "error: no data found."
    return (r, resp)


@api.route("/api/get_vcard/{osm_id}")
async def get_vcard(req, resp, *, osm_id):
    r, resp = await get_poi_info(req, resp, osm_id)

    if resp.status_code == 504 or resp.status_code == 404:
        return
    else:
        resp.status_code = r.status_code

    data = json.loads(r.text)["hits"]["hits"][0]["_source"]
    # compose vcard
    begin = "BEGIN:VCARD"
    end = "END:VCARD"
    name = data["name"]
    lon, lat = data["location"]
    contact_email = data["labels"].get("contact_email", "")
    contact_fax = data["labels"].get("contact_fax", "")
    contact_phone = data["labels"].get("phone", "").replace(" ", "")
    contact_website = data["labels"].get("website", "")
    addr_street = data["labels"].get("addr_street", "")
    addr_housenumber = data["labels"].get("addr_housenumber", "")
    addr_postcode = data["labels"].get("addr_postcode", "")
    addr_city = data["labels"].get("addr_city", "")
    addr_country = data["labels"].get("addr_country", "")

    version = "VERSION:3.0"
    # version = "VERSION:4.0"

    n = f"N:{name};;;;"
    fn = f"FN:{name}"
    # profile = "PROFILE:VCARD"
    # TODO if address incomplete omit address
    address = (
        f"ADR;TYPE=WORK:;;{addr_street} {addr_housenumber};"
        f"{addr_city};;{addr_postcode};{addr_country}"
    )
    # v3
    # label = (
    #     f"LABEL;TYPE=WORK:{addr_street} {addr_housenumber},\n"
    #     f"{addr_postcode}{addr_city}\n{addr_country}"
    # )
    email = f"EMAIL:{contact_email}"
    # v3
    geo = f"GEO:{lat},{lon}"
    # v4
    # geo = f"GEO:geo: {lat}\,{lon}"
    # v3
    phone = f"TEL;TYPE=WORK,voice;VALUE=tel:{contact_phone}"
    # v4
    # phone = f"TEL;TYPE=work,voice;VALUE=uri:tel:\"{contact_phone}\""
    # logger.debug(contact_phone)
    # v3
    fax = f"TEL;TYPE=WORK FAX;VALUE=tel:{contact_fax}"
    # v4
    # fax = f"TEL;TYPE=WORK FAX;VALUE=uri:tel:{contact_fax}"
    url = f"URL:{contact_website}"
    source = f"SOURCE:https://yellowosm.com/api/get_vcard/{osm_id}"

    resp.headers = {
        "Content-Type": "text/vcard",
        "Content-disposition": 'attachment; filename="'
        + name.replace(" ", "_")
        + "_"
        + str(osm_id)
        + '.vcard"',
    }
    resp.text = (
        f"{begin}\n{version}\n{n}\n{fn}\n{address}\n{geo}\n{phone}\n{fax}\n"
        + f"{url}\n{email}\n{source}\n{end}"
    )


@api.route("/api/get_json/{osm_id}")
async def get_json(req, resp, *, osm_id):
    r, resp = await get_poi_info(req, resp, osm_id)

    # logger.info(r.status_code)
    # logger.info(r.text)
    # logger.info(resp.status_code)
    # logger.info(resp.text)

    if resp.status_code == 504 or resp.status_code == 404:
        return
    else:
        resp.status_code = r.status_code

    data = json.loads(r.text)["hits"]["hits"][0]["_source"]
    if int(req.params.get("pretty", ["0"])[0]) == 1:
        resp.text = json.dumps(data, indent=4, sort_keys=True)
    else:
        resp.media = data


def _locate_user_ip(req):
    logger.info("client: " + str(req._starlette.client[0]))
    geoip = geoip2.database.Reader("./lib/geoip/GeoLite2-City.mmdb")

    # redirect users outside of DACH to
    fallback_lat, fallback_lon = 47.07070, 15.43950  # Graz
    # fallback_lat, fallback_lon = 49.4129, 8.6941 # Heidelberg, SOTM 2019

    client = str(req._starlette.client[0])
    forw_for = (
        req.headers["x-forwarded-for"] if "x-forwarded-for" in req.headers else client
    )
    remote_client = forw_for.split(",")[0]
    try:
        geoip_resp = geoip.city(remote_client)
        lat, lon = geoip_resp.location.latitude, geoip_resp.location.longitude
        if geoip_resp.country.iso_code not in ["AT", "DE", "CH", "LI"]:
            lat, lon = fallback_lat, fallback_lon
    except geoip2.errors.AddressNotFoundError:
        lat, lon = fallback_lat, fallback_lon
    geoip.close()

    data = {"ip": str(remote_client), "lat": lat, "lon": lon}
    return data


@api.route("/api/forward_ip")
async def locate_user_ip(req, resp):
    data = _locate_user_ip(req)

    redir_url = SHORT_URL_REDIRECT_URL.format(zoom=13, x=data["lat"], y=data["lon"])
    logger.debug("redirect to --> %s", redir_url)
    resp.status_code = 302
    resp.headers["Location"] = redir_url


@api.route("/api/search/{query}")
@api.route(
    "/api/search/{query}/{top_left_lat}/"
    "{top_left_lon}/{bottom_right_lat}/{bottom_right_lon}"
)
async def query_elastic_search(
    req, resp, *, query, top_left_lat, top_left_lon, bottom_right_lat, bottom_right_lon
):

    """search elastic search index for 'query'.
    add top left and bottom right coordinates to limit the results to
    geo-coordinates
    """
    # ES_URL and ES_INDEX from settings env
    url = ES_URL + "/" + ES_INDEX + "/_search"
    logger.info("es index: " + ES_INDEX)

    logger.info(top_left_lat)
    if not top_left_lat:
        logger.info("no bbox given")
        # DACH region:
        top_left_lat, top_left_lon = 55.05918, 5.01902
        bottom_right_lat, bottom_right_lon = 45.98486, 17.25582

    es_filter = None
    es_filter = {
        "geo_bounding_box": {
            "location": {
                "top_left": {"lat": float(top_left_lat), "lon": float(top_left_lon)},
                "bottom_right": {
                    "lat": float(bottom_right_lat),
                    "lon": float(bottom_right_lon),
                },
            }
        }
    }

    es_query = json.dumps(
        {
            "size": 300,
            "query": {
                "bool": {
                    "should": [
                        {
                            "query_string": {
                                "query": urllib.parse.unquote(query.strip()) + "*",
                                "default_operator": "AND",
                                "fields": [
                                    "labels.name^5",
                                    "description^50",
                                    #   // 'labels.website^3',
                                    #   // 'labels.contact_website',
                                    #   // 'labels.addr_street',
                                    "labels.addr_city",
                                    "labels.amenity",
                                    "labels.craft",
                                    "labels.emergency",
                                    "labels.healthcare",
                                    "labels.healthcare_speciality",
                                    "labels.leisure",
                                    "labels.shop",
                                    "labels.sport",
                                    "labels.tourism",
                                    "labels.vending",
                                ],
                            }
                        }
                    ],
                    "minimum_should_match": 1,
                    "filter": es_filter,
                }
            },
        }
    )

    logger.info(url)
    logger.info(es_query)
    r = requests.get(url, data=es_query, headers={"Content-Type": "application/json"})

    logger.info("status code: " + str(r.status_code))
    logger.info(r.text[:200])

    resp.status_code = r.status_code

    result = []
    for hit in json.loads(r.text)["hits"]["hits"]:
        loc = {
            "location": {
                "lat": hit["_source"]["location"][1],
                "lon": hit["_source"]["location"][0],
            }
        }
        result.append({**hit["_source"]["labels"], **loc})

    logger.info(result)
    resp.media = result


if __name__ == "__main__":
    api.run(debug=DEBUG)
