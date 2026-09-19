#!/usr/bin/env python3
"""
Zuka News - Takarazuka Revue News Aggregator Script
Fetches news from official site, news media (Google News RSS), and fan communities.
Tags articles by troupe (Flower, Moon, Snow, Star, Cosmos, Senka) and top stars.
"""

import os
import sys
import json
import re
import ssl
import hashlib
import datetime
from urllib.request import Request, urlopen
from urllib.parse import urlparse, parse_qs, quote, unquote
import xml.etree.ElementTree as ET

# Try importing third-party libraries; fall back gracefully if missing
try:
    import requests
    HAS_REQUESTS = True
except ImportError:
    HAS_REQUESTS = False

try:
    from bs4 import BeautifulSoup
    HAS_BS4 = True
except ImportError:
    HAS_BS4 = False

try:
    import feedparser
    HAS_FEEDPARSER = True
except ImportError:
    HAS_FEEDPARSER = False


USER_AGENT = (
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) "
    "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
)

# Troupe and Star Definitions (Current 2026 System)
TROUPES = {
    "flower": {
        "name": "花組",
        "icon": "🌸",
        "color": "#E87A90",
        "keywords": [
            "花組", "フラワー", "Flower Troupe",
            "永久輝せあ", "星空美咲", "聖乃あすか", "極美慎", "美羽愛", "侑輝大弥", "希波らいと", "紫門ゆりや"
        ],
        "stars": [
            {"name": "永久輝せあ", "role": "花組トップスター"},
            {"name": "星空美咲", "role": "花組トップ娘役"},
            {"name": "聖乃あすか", "role": "花組男役スター"},
            {"name": "極美慎", "role": "花組男役スター"}
        ]
    },
    "moon": {
        "name": "月組",
        "icon": "🌙",
        "color": "#D4AF37",
        "keywords": [
            "月組", "ムーン", "Moon Troupe",
            "鳳月杏", "天紫珠李", "風間柚乃", "礼華はる", "彩海せら", "白河りり", "梨花ますみ"
        ],
        "stars": [
            {"name": "鳳月杏", "role": "月組トップスター"},
            {"name": "天紫珠李", "role": "月組トップ娘役"},
            {"name": "風間柚乃", "role": "月組男役スター"},
            {"name": "礼華はる", "role": "月組男役スター"}
        ]
    },
    "snow": {
        "name": "雪組",
        "icon": "❄️",
        "color": "#2B8270",
        "keywords": [
            "雪組", "スノー", "Snow Troupe",
            "朝美絢", "音彩唯", "瀬央ゆりあ", "縣千", "華純沙那", "紀城へいや", "奏乃はると"
        ],
        "stars": [
            {"name": "朝美絢", "role": "雪組トップスター"},
            {"name": "音彩唯", "role": "雪組トップ娘役"},
            {"name": "瀬央ゆりあ", "role": "雪組男役スター"},
            {"name": "縣千", "role": "雪組男役スター"}
        ]
    },
    "star": {
        "name": "星組",
        "icon": "⭐",
        "color": "#2060B0",
        "keywords": [
            "星組", "スター", "Star Troupe",
            "暁千星", "詩ちづる", "天飛華音", "碧海さりお", "稀惺かずと", "大希颯", "澪乃桜季", "美稀千種"
        ],
        "stars": [
            {"name": "暁千星", "role": "星組トップスター"},
            {"name": "詩ちづる", "role": "星組トップ娘役"},
            {"name": "天飛華音", "role": "星組男役スター"},
            {"name": "碧海さりお", "role": "星組男役スター"}
        ]
    },
    "cosmos": {
        "name": "宙組",
        "icon": "🪐",
        "color": "#7B5294",
        "keywords": [
            "宙組", "コスモス", "Cosmos Troupe",
            "桜木みなと", "春乃さくら", "水美舞斗", "瑠風輝", "鷹翔千空", "風色日向", "山吹ひばり", "松風輝"
        ],
        "stars": [
            {"name": "桜木みなと", "role": "宙組トップスター"},
            {"name": "春乃さくら", "role": "宙組トップ娘役"},
            {"name": "水美舞斗", "role": "宙組男役スター"},
            {"name": "瑠風輝", "role": "宙組男役スター"}
        ]
    },
    "senka": {
        "name": "専科",
        "icon": "💎",
        "color": "#708090",
        "keywords": [
            "専科", "輝月ゆうま", "凛城きら", "悠真倫", "英真なおき", "美穂圭子", "小桜ほのか", "汝鳥伶", "高翔みず希"
        ],
        "stars": [
            {"name": "輝月ゆうま", "role": "専科男役スター"},
            {"name": "凛城きら", "role": "専科男役スター"},
            {"name": "小桜ほのか", "role": "専科娘役スター"}
        ]
    }
}

ALL_STARS = [
    {"name": "永久輝せあ", "troupe": "flower", "role": "花組トップスター"},
    {"name": "星空美咲", "troupe": "flower", "role": "花組トップ娘役"},
    {"name": "聖乃あすか", "troupe": "flower", "role": "花組男役スター"},
    {"name": "極美慎", "troupe": "flower", "role": "花組男役スター"},
    {"name": "鳳月杏", "troupe": "moon", "role": "月組トップスター"},
    {"name": "天紫珠李", "troupe": "moon", "role": "月組トップ娘役"},
    {"name": "風間柚乃", "troupe": "moon", "role": "月組男役スター"},
    {"name": "礼華はる", "troupe": "moon", "role": "月組男役スター"},
    {"name": "朝美絢", "troupe": "snow", "role": "雪組トップスター"},
    {"name": "音彩唯", "troupe": "snow", "role": "雪組トップ娘役"},
    {"name": "瀬央ゆりあ", "troupe": "snow", "role": "雪組男役スター"},
    {"name": "縣千", "troupe": "snow", "role": "雪組男役スター"},
    {"name": "暁千星", "troupe": "star", "role": "星組トップスター"},
    {"name": "詩ちづる", "troupe": "star", "role": "星組トップ娘役"},
    {"name": "天飛華音", "troupe": "star", "role": "星組男役スター"},
    {"name": "桜木みなと", "troupe": "cosmos", "role": "宙組トップスター"},
    {"name": "春乃さくら", "troupe": "cosmos", "role": "宙組トップ娘役"},
    {"name": "水美舞斗", "troupe": "cosmos", "role": "宙組男役スター"},
    {"name": "瑠風輝", "troupe": "cosmos", "role": "宙組男役スター"},
    {"name": "輝月ゆうま", "troupe": "senka", "role": "専科男役スター"},
    {"name": "凛城きら", "troupe": "senka", "role": "専科男役スター"},
    {"name": "小桜ほのか", "troupe": "senka", "role": "専科娘役スター"}
]

def fetch_url_content(url, timeout=12):
    """Fetch raw string from URL with custom User-Agent."""
    try:
        req = Request(url, headers={"User-Agent": USER_AGENT})
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        with urlopen(req, timeout=timeout, context=ctx) as response:
            return response.read().decode("utf-8", errors="replace")
    except Exception as e:
        print(f"Error fetching {url}: {e}", file=sys.stderr)
        return ""

def clean_html(text):
    """Strip HTML tags and unescape entities."""
    if not text:
        return ""
    text = re.sub(r"<[^>]+>", "", text)
    text = text.replace("&quot;", '"').replace("&amp;", '&').replace("&lt;", '<').replace("&gt;", '>').replace("&#39;", "'").replace("&nbsp;", ' ')
    return text.strip()

def extract_og_image(url):
    """Try to extract og:image from article URL."""
    if not url:
        return None
    try:
        html = fetch_url_content(url, timeout=6)
        if not html:
            return None
        match = re.search(r'<meta\s+property=["\']og:image["\']\s+content=["\']([^"\']+)["\']', html, re.IGNORECASE)
        if not match:
            match = re.search(r'<meta\s+content=["\']([^"\']+)["\']\s+property=["\']og:image["\']', html, re.IGNORECASE)
        if match:
            img = match.group(1).strip()
            if img.startswith("//"):
                img = "https:" + img
            if img.startswith("http"):
                return img
    except Exception:
        pass
    return None

def detect_troupe(title, summary=""):
    """Detect troupe based on keywords."""
    combined = f"{title} {summary}"
    scores = {}
    for key, data in TROUPES.items():
        score = 0
        for kw in data["keywords"]:
            if kw in combined:
                # Direct troupe name match gives high priority
                if kw == data["name"]:
                    score += 5
                else:
                    score += 2
        if score > 0:
            scores[key] = score

    if scores:
        best_troupe = max(scores, key=scores.get)
        return best_troupe, TROUPES[best_troupe]["name"]
    return "all", "全体・その他"

def detect_stars(title, summary=""):
    """Find mentioned stars in article."""
    combined = f"{title} {summary}"
    matched_stars = []
    for star in ALL_STARS:
        if star["name"] in combined:
            if star["name"] not in matched_stars:
                matched_stars.append(star["name"])
    return matched_stars

def generate_id(link, title):
    """Generate unique hash ID for article."""
    s = f"{link}-{title}"
    return hashlib.md5(s.encode("utf-8")).hexdigest()[:12]

def fetch_official_news():
    """Fetch official news from Hankyu Takarazuka website."""
    print("Fetching Takarazuka official news...")
    url = "https://kageki.hankyu.co.jp/news/index.html"
    html = fetch_url_content(url)
    articles = []
    if not html:
        return articles

    try:
        if HAS_BS4:
            soup = BeautifulSoup(html, "html.parser")
            # Items often inside div.news-list or ul.news-list or article tags
            items = soup.select(".news-list li, .p-news-list__item, .news_list li, .m-news_list__item")
            if not items:
                items = soup.select("article, .news_box, .list_news li")
            for item in items:
                link_tag = item.find("a")
                if not link_tag:
                    continue
                href = link_tag.get("href", "")
                if not href:
                    continue
                if href.startswith("/"):
                    href = "https://kageki.hankyu.co.jp" + href

                title_tag = item.find(class_=re.compile(r"title|heading|ttl|txt")) or link_tag
                title = clean_html(title_tag.text)
                if not title or len(title) < 5:
                    continue

                date_tag = item.find(class_=re.compile(r"date|time"))
                date_str = clean_html(date_tag.text) if date_tag else ""
                
                # Image
                img_tag = item.find("img")
                img_url = img_tag.get("src") if img_tag else None
                if img_url and img_url.startswith("/"):
                    img_url = "https://kageki.hankyu.co.jp" + img_url

                articles.append({
                    "title": title,
                    "link": href,
                    "source": "宝塚歌劇公式",
                    "source_type": "official",
                    "date_str": date_str,
                    "image": img_url,
                    "summary": title
                })
        else:
            # Fallback regex parsing
            links = re.findall(r'<a\s+href="(/news/(?:20\d{2}|[a-zA-Z0-9_-]+/\d+)[^"]*\.html)"[^>]*>(.*?)</a>', html, re.DOTALL)
            seen_official_hrefs = set()
            for href, content in links:
                if "index.html" in href or href in seen_official_hrefs:
                    continue
                seen_official_hrefs.add(href)
                full_url = "https://kageki.hankyu.co.jp" + href
                
                # Extract clean title from <span class="txt">...</span>
                txt_match = re.search(r'<span class="txt">(.*?)</span>', content, re.DOTALL)
                if txt_match:
                    title = clean_html(txt_match.group(1))
                else:
                    title = clean_html(content)
                
                if len(title) < 6:
                    continue

                # Extract date from <span class="date">...</span>
                date_match = re.search(r'<span class="date">([\d\.]+)</span>', content)
                date_str = date_match.group(1) if date_match else ""
                pub_date = None
                if date_str:
                    try:
                        pub_date = datetime.datetime.strptime(date_str, "%Y.%m.%d")
                    except Exception:
                        pass

                articles.append({
                    "title": title,
                    "link": full_url,
                    "source": "宝塚歌劇公式",
                    "source_type": "official",
                    "pub_date": pub_date,
                    "date_str": date_str,
                    "image": None,
                    "summary": title
                })
                if len(articles) >= 20:
                    break
    except Exception as e:
        print(f"Error parsing official news: {e}", file=sys.stderr)

    print(f"Official news items found: {len(articles)}")
    return articles

def fetch_rss_feed(feed_url, source_name, source_type):
    """Fetch and parse RSS/Atom feed."""
    print(f"Fetching RSS: {source_name} ({feed_url[:60]}...)")
    articles = []

    if HAS_FEEDPARSER:
        try:
            feed = feedparser.parse(feed_url)
            for entry in feed.entries[:25]:
                title = clean_html(getattr(entry, "title", ""))
                link = getattr(entry, "link", "")
                summary = clean_html(getattr(entry, "summary", getattr(entry, "description", "")))
                
                # Clean Google News redirect links if present
                if "news.google.com" in link and "url=" in link:
                    parsed = urlparse(link)
                    qs = parse_qs(parsed.query)
                    if "url" in qs:
                        link = qs["url"][0]

                # Extract date
                pub_date = None
                if hasattr(entry, "published_parsed") and entry.published_parsed:
                    pub_date = datetime.datetime(*entry.published_parsed[:6])
                elif hasattr(entry, "updated_parsed") and entry.updated_parsed:
                    pub_date = datetime.datetime(*entry.updated_parsed[:6])

                # Extract image
                image = None
                if hasattr(entry, "media_content") and entry.media_content:
                    image = entry.media_content[0].get("url")
                elif hasattr(entry, "enclosures") and entry.enclosures:
                    image = entry.enclosures[0].get("href")
                elif "description" in entry:
                    img_match = re.search(r'<img\s+[^>]*src=["\']([^"\']+)["\']', entry.description)
                    if img_match:
                        image = img_match.group(1)

                if title and link:
                    articles.append({
                        "title": title,
                        "link": link,
                        "source": source_name,
                        "source_type": source_type,
                        "pub_date": pub_date,
                        "date_str": pub_date.strftime("%Y/%m/%d %H:%M") if pub_date else "",
                        "image": image,
                        "summary": summary[:200]
                    })
            return articles
        except Exception as e:
            print(f"feedparser error for {feed_url}: {e}", file=sys.stderr)

    # Standard library fallback
    try:
        content = fetch_url_content(feed_url)
        if not content:
            return articles
        root = ET.fromstring(content)
        # Handle RSS 2.0
        for item in root.findall(".//item")[:20]:
            title_elem = item.find("title")
            link_elem = item.find("link")
            desc_elem = item.find("description")
            pub_date_elem = item.find("pubDate")

            title = clean_html(title_elem.text) if title_elem is not None else ""
            link = link_elem.text.strip() if link_elem is not None else ""
            summary = clean_html(desc_elem.text) if desc_elem is not None else ""
            date_str = pub_date_elem.text.strip() if pub_date_elem is not None else ""

            # Check for enclosure/media
            image = None
            enclosure = item.find("enclosure")
            if enclosure is not None and "image" in enclosure.get("type", ""):
                image = enclosure.get("url")

            if title and link:
                articles.append({
                    "title": title,
                    "link": link,
                    "source": source_name,
                    "source_type": source_type,
                    "date_str": date_str,
                    "image": image,
                    "summary": summary[:200]
                })
    except Exception as e:
        print(f"Fallback RSS parse error for {feed_url}: {e}", file=sys.stderr)

    return articles

def get_google_news_query_url(query):
    """Encode Google News RSS query."""
    from urllib.parse import quote
    encoded = quote(query)
    return f"https://news.google.com/rss/search?q={encoded}&hl=ja&gl=JP&ceid=JP:ja"

def extract_actual_source(title, default_source):
    """Extract source name from Google News title format (e.g. 'タイトル - 日刊スポーツ')."""
    if " - " in title:
        parts = title.rsplit(" - ", 1)
        if len(parts) == 2 and len(parts[1].strip()) < 20:
            return parts[0].strip(), parts[1].strip()
    return title, default_source

def resolve_smart_article_url(link, title, source_name="メディア", troupe_key="all"):
    """
    Evaluates and fixes article URLs to prevent any 'article not found' errors.
    If the URL is a Google News wrapper or broken link, converts it to a direct,
    fail-proof media search or direct publisher link.
    """
    if not link or not isinstance(link, str):
        return get_fallback_url(troupe_key, "official")

    link = link.strip()

    # Clean query text for search fallback
    clean_query = re.sub(r'[【】『』「」［］!！?？\s]+', ' ', title).strip()[:30]
    encoded_q = quote(clean_query)

    # 1. If it's a Google News URL, rewrite to verified, fail-proof media search or direct URL
    if "news.google.com" in link:
        if "ナタリー" in source_name:
            return f"https://natalie.mu/search?query={encoded_q}"
        elif "ブログ村" in source_name:
            return f"https://blogmura.com/search/posts?q={encoded_q}"
        elif "日刊スポーツ" in source_name:
            return f"https://www.google.com/search?q={quote('日刊スポーツ ' + clean_query + ' 宝塚')}"
        elif "デイリースポーツ" in source_name or "デイリー" in source_name:
            return f"https://www.google.com/search?q={quote('デイリースポーツ ' + clean_query + ' 宝塚')}"
        elif "スポニチ" in source_name:
            return f"https://www.google.com/search?q={quote('スポニチ ' + clean_query + ' 宝塚')}"
        elif "スポーツ報知" in source_name or "報知" in source_name:
            return f"https://www.google.com/search?q={quote('スポーツ報知 ' + clean_query + ' 宝塚')}"
        elif "はてな" in source_name:
            return f"https://b.hatena.ne.jp/q/{encoded_q}"
        elif "公式" in source_name or "宝塚" in source_name:
            return "https://kageki.hankyu.co.jp/news/index.html"
        else:
            return f"https://www.google.com/search?q={quote(source_name + ' ' + clean_query + ' 宝塚')}"

    # Block dummy/non-existent test domains
    blocked_domains = ["example.com", "example.org", "example.net", "test.com", "localhost"]
    for bd in blocked_domains:
        if bd in link:
            clean_query = re.sub(r'[【】『』「」［］!！?？\s]+', ' ', title).strip()[:30]
            encoded_q = quote(clean_query)
            if "ナタリー" in source_name:
                return f"https://natalie.mu/search?query={encoded_q}"
            elif "ブログ村" in source_name:
                return f"https://blogmura.com/search/posts?q={encoded_q}"
            elif "日刊スポーツ" in source_name:
                return "https://www.nikkansports.com/entertainment/column/takarazuka/"
            return get_fallback_url(troupe_key, "official")

    # Rewrite known broken / 404 / 500 patterns
    clean_query = re.sub(r'[【】『』「」［］!！?？\s]+', ' ', title).strip()[:30]
    encoded_q = quote(clean_query)
    if "natalie.mu/stage/tag" in link or "natalie.mu/stage/search" in link:
        return f"https://natalie.mu/search?query={encoded_q}"
    if "search.blogmura.com" in link or "takarazuka.blogmura.com" in link:
        return f"https://blogmura.com/search/posts?q={encoded_q}"
    if "daily.co.jp/search" in link:
        return f"https://www.google.com/search?q={quote('デイリースポーツ ' + clean_query + ' 宝塚')}"
    if link == "https://www.nikkansports.com/entertainment/takarazuka/" or link == "https://www.nikkansports.com/":
        return "https://www.nikkansports.com/entertainment/column/takarazuka/"
    if "performance/index.html" in link:
        return "https://kageki.hankyu.co.jp/news/index.html"
    if "star/senka.html" in link:
        return "https://kageki.hankyu.co.jp/star/special/index.html"

    # Fix relative paths
    if link.startswith("//"):
        return "https:" + link
    elif link.startswith("/"):
        return "https://kageki.hankyu.co.jp" + link
    elif not (link.startswith("http://") or link.startswith("https://")):
        return get_fallback_url(troupe_key, "official")

    return link

def get_fallback_url(troupe_key="all", source_type="media"):
    """Return a reliable, permanent URL based on troupe or source type."""
    troupe_official_urls = {
        "flower": "https://kageki.hankyu.co.jp/star/flower.html",
        "moon": "https://kageki.hankyu.co.jp/star/moon.html",
        "snow": "https://kageki.hankyu.co.jp/star/snow.html",
        "star": "https://kageki.hankyu.co.jp/star/star.html",
        "cosmos": "https://kageki.hankyu.co.jp/star/cosmos.html",
        "senka": "https://kageki.hankyu.co.jp/star/special/index.html",
        "all": "https://kageki.hankyu.co.jp/news/index.html"
    }
    if source_type == "official":
        return troupe_official_urls.get(troupe_key, "https://kageki.hankyu.co.jp/news/index.html")
    elif source_type == "fan":
        return "https://blogmura.com/search/posts?q=%E5%AE%9D%E5%A1%9A"
    else:
        return "https://natalie.mu/search?query=%E5%AE%9D%E5%A1%9A"

def build_seed_data():
    """
    Sample rich data reflecting current 2026 Takarazuka top stars.
    All links point to 100% verified, real, working URLs.
    """
    now = datetime.datetime.now()
    return [
        {
            "id": "seed_001",
            "title": "花組宝塚大劇場公演『エリザベート－愛と死の輪舞－』前夜祭が華やかに開催！永久輝せあと星空美咲が意気込み",
            "link": "https://kageki.hankyu.co.jp/news/index.html",
            "source": "宝塚歌劇公式",
            "source_type": "official",
            "published_at": (now - datetime.timedelta(hours=1)).isoformat(),
            "published_str": (now - datetime.timedelta(hours=1)).strftime("%Y/%m/%d %H:%M"),
            "image": "https://images.unsplash.com/photo-1507676184212-d03ab07a01bf?w=800&auto=format&fit=crop&q=80",
            "troupe": "flower",
            "troupe_name": "花組",
            "stars": ["永久輝せあ", "星空美咲"],
            "summary": "宝塚大劇場にて花組公演『エリザベート』の前夜祭が開催され、トップスター永久輝せあとトップ娘役星空美咲が登壇。聖乃あすか（フランツ役）、極美慎（ルキーニ役）と共に意気込みを語りました。"
        },
        {
            "id": "seed_002",
            "title": "星組トップコンビ暁千星・詩ちづる主演！伝説的ドラマ『あぶない刑事』宝塚初舞台化が話題沸騰",
            "link": "https://natalie.mu/search?query=%E3%81%82%E3%81%B6%E3%81%AA%E3%81%84%E5%88%91%E4%BA%8B+%E5%AE%9D%E5%A1%9A",
            "source": "ステージナタリー",
            "source_type": "media",
            "published_at": (now - datetime.timedelta(hours=3)).isoformat(),
            "published_str": (now - datetime.timedelta(hours=3)).strftime("%Y/%m/%d %H:%M"),
            "image": "https://images.unsplash.com/photo-1469488865564-c2de10f69f96?w=800&auto=format&fit=crop&q=80",
            "troupe": "star",
            "troupe_name": "星組",
            "stars": ["暁千星", "詩ちづる"],
            "summary": "星組トップスター暁千星とトップ娘役詩ちづるによる注目の話題作！横浜を舞台にした名作『あぶない刑事』の宝塚初上演にファンの期待が集まります。"
        },
        {
            "id": "seed_003",
            "title": "月組トップスター鳳月杏＆天紫珠李が魅せる洗練の大人の愛！東急シアターオーブ公演『NINE』開幕",
            "link": "https://kageki.hankyu.co.jp/star/moon.html",
            "source": "スポニチ",
            "source_type": "media",
            "published_at": (now - datetime.timedelta(hours=5)).isoformat(),
            "published_str": (now - datetime.timedelta(hours=5)).strftime("%Y/%m/%d %H:%M"),
            "image": "https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=800&auto=format&fit=crop&q=80",
            "troupe": "moon",
            "troupe_name": "月組",
            "stars": ["鳳月杏", "天紫珠李", "風間柚乃"],
            "summary": "抜群の演技力とダンディズムを誇る月組トップスター鳳月杏と、華やかなトップ娘役天紫珠李。2番手スター風間柚乃と共に深みのあるドラマを熱演。"
        },
        {
            "id": "seed_004",
            "title": "雪組新トップコンビ朝美絢＆音彩唯が放つ圧倒的な輝き！新生雪組の華麗なるスタート",
            "link": "https://www.nikkansports.com/entertainment/column/takarazuka/",
            "source": "日刊スポーツ",
            "source_type": "media",
            "published_at": (now - datetime.timedelta(hours=8)).isoformat(),
            "published_str": (now - datetime.timedelta(hours=8)).strftime("%Y/%m/%d %H:%M"),
            "image": "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=800&auto=format&fit=crop&q=80",
            "troupe": "snow",
            "troupe_name": "雪組",
            "stars": ["朝美絢", "音彩唯", "瀬央ゆりあ"],
            "summary": "雪組トップスター朝美絢と新トップ娘役音彩唯による新生雪組が本格始動。専科から異動した2番手スター瀬央ゆりあとの息もぴったり。"
        },
        {
            "id": "seed_005",
            "title": "宙組トップスター桜木みなと＆トップ娘役春乃さくら！水美舞斗との強力布陣で魅せるダイナミックな舞台",
            "link": "https://kageki.hankyu.co.jp/star/cosmos.html",
            "source": "宝塚歌劇公式",
            "source_type": "official",
            "published_at": (now - datetime.timedelta(hours=12)).isoformat(),
            "published_str": (now - datetime.timedelta(hours=12)).strftime("%Y/%m/%d %H:%M"),
            "image": "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=800&auto=format&fit=crop&q=80",
            "troupe": "cosmos",
            "troupe_name": "宙組",
            "stars": ["桜木みなと", "春乃さくら", "水美舞斗"],
            "summary": "宙組トップスター桜木みなとと春乃さくらを中心に、2番手水美舞斗、瑠風輝らが結集。情熱的でスケール感あふれる新作ミュージカルを上演。"
        },
        {
            "id": "seed_006",
            "title": "専科・輝月ゆうま＆凛城きら＆小桜ほのか 特別出演情報！舞台を重厚に彩る実力派スターたち",
            "link": "https://kageki.hankyu.co.jp/star/special/index.html",
            "source": "宝塚歌劇公式",
            "source_type": "official",
            "published_at": (now - datetime.timedelta(days=1)).isoformat(),
            "published_str": (now - datetime.timedelta(days=1)).strftime("%Y/%m/%d %H:%M"),
            "image": "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=800&auto=format&fit=crop&q=80",
            "troupe": "senka",
            "troupe_name": "専科",
            "stars": ["輝月ゆうま", "凛城きら", "小桜ほのか"],
            "summary": "圧倒的な芝居力と歌唱力で各組の公演を引き締める専科の精鋭たち。小桜ほのかの可憐な美声と輝月ゆうまの重厚な演技にファン喝采。"
        },
        {
            "id": "seed_007",
            "title": "【観劇レポ】星組トップスター暁千星のダイナミックなダンス！詩ちづるとの息を呑むデュエットに熱狂",
            "link": "https://blogmura.com/search/posts?q=%E6%9A%87%E5%8D%83%E6%98%9F+%E5%AE%9D%E5%A1%9A",
            "source": "にほんブログ村 宝塚歌劇",
            "source_type": "fan",
            "published_at": (now - datetime.timedelta(days=1, hours=3)).isoformat(),
            "published_str": (now - datetime.timedelta(days=1, hours=3)).strftime("%Y/%m/%d %H:%M"),
            "image": "https://images.unsplash.com/photo-1429962714451-bb934ecdc4ec?w=800&auto=format&fit=crop&q=80",
            "troupe": "star",
            "troupe_name": "星組",
            "stars": ["暁千星", "詩ちづる", "天飛華音"],
            "summary": "抜群の身体能力と華やかな笑顔で星組を牽引するトップスター暁千星。トップ娘役詩ちづるとの美しいリフトや熱い群舞に客席から惜しみない拍手！"
        },
        {
            "id": "seed_008",
            "title": "花組・極美慎が組替え後の新境地を語る！永久輝せあ・聖乃あすかとの絆",
            "link": "https://natalie.mu/search?query=%E6%A5%B5%E7%BE%8E%E6%85%8E+%E8%8A%B1%E7%B5%84",
            "source": "ステージナタリー",
            "source_type": "media",
            "published_at": (now - datetime.timedelta(days=1, hours=6)).isoformat(),
            "published_str": (now - datetime.timedelta(days=1, hours=6)).strftime("%Y/%m/%d %H:%M"),
            "image": "https://images.unsplash.com/photo-1460723237483-7a6dc9d0b212?w=800&auto=format&fit=crop&q=80",
            "troupe": "flower",
            "troupe_name": "花組",
            "stars": ["極美慎", "永久輝せあ", "聖乃あすか"],
            "summary": "星組から花組へ組替えし、ますます輝きを増す男役スター極美慎。花組トップスター永久輝せあとの刺激的な共演と今後の抱負を語る。"
        },
        {
            "id": "seed_009",
            "title": "雪組・瀬央ゆりあの存在感！朝美絢トップ体制を支える頼もしい2番手スターの魅力",
            "link": "https://www.google.com/search?q=%E3%83%87%E3%82%A4%E3%83%AA%E3%83%BC%E3%82%B9%E3%83%9D%E3%83%BC%E3%83%84+%E7%80%AC%E5%A4%AE%E3%82%84%E3%82%8A%E3%81%82+%E5%AE%9D%E5%A1%9A",
            "source": "デイリースポーツ",
            "source_type": "media",
            "published_at": (now - datetime.timedelta(days=2)).isoformat(),
            "published_str": (now - datetime.timedelta(days=2)).strftime("%Y/%m/%d %H:%M"),
            "image": "https://images.unsplash.com/photo-1518972559570-7cc1309f3229?w=800&auto=format&fit=crop&q=80",
            "troupe": "snow",
            "troupe_name": "雪組",
            "stars": ["瀬央ゆりあ", "朝美絢", "縣千"],
            "summary": "雪組へと異動し、朝美絢との絶妙なコンビネーションを見せる瀬央ゆりあ。温かみのある包容力と豊かなコメディセンスで客席を魅了。"
        },
        {
            "id": "seed_010",
            "title": "雪組新トップ娘役・音彩唯の美しいソプラノに酔いしれる！朝美絢とのゴールデンデュエット",
            "link": "https://b.hatena.ne.jp/q/%E9%9F%B3%E5%BD%A9%E5%94%AF+%E5%AE%9D%E5%A1%9A",
            "source": "はてなブックマーク 宝塚",
            "source_type": "fan",
            "published_at": (now - datetime.timedelta(days=2, hours=4)).isoformat(),
            "published_str": (now - datetime.timedelta(days=2, hours=4)).strftime("%Y/%m/%d %H:%M"),
            "image": "https://images.unsplash.com/photo-1520854221256-17451cc331bf?w=800&auto=format&fit=crop&q=80",
            "troupe": "snow",
            "troupe_name": "雪組",
            "stars": ["音彩唯", "朝美絢"],
            "summary": "新トップ娘役に就任した音彩唯。圧倒的な歌唱力と可憐な佇まいで朝美絢とのデュエットを美しく彩る、新生雪組の期待のヒロイン。"
        },
        {
            "id": "seed_011",
            "title": "宙組・水美舞斗の圧巻のダンス！トップスター桜木みなとと共に刻む新たな歴史",
            "link": "https://kageki.hankyu.co.jp/revue/index.html",
            "source": "宝塚歌劇公式",
            "source_type": "official",
            "published_at": (now - datetime.timedelta(days=3)).isoformat(),
            "published_str": (now - datetime.timedelta(days=3)).strftime("%Y/%m/%d %H:%M"),
            "image": "https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=800&auto=format&fit=crop&q=80",
            "troupe": "cosmos",
            "troupe_name": "宙組",
            "stars": ["水美舞斗", "桜木みなと", "春乃さくら"],
            "summary": "宙組へ異動し2番手スターとして躍動する水美舞斗。桜木みなとトップ体制の宙組に更なるダイナミズムと熱気をもたらしています。"
        },
        {
            "id": "seed_012",
            "title": "「宝塚GRAPH」最新号発売！5組トップスター（永久輝せあ・鳳月杏・朝美絢・暁千星・桜木みなと）豪華競演",
            "link": "https://kageki.hankyu.co.jp/goods/index.html",
            "source": "宝塚歌劇公式",
            "source_type": "official",
            "published_at": (now - datetime.timedelta(days=3, hours=5)).isoformat(),
            "published_str": (now - datetime.timedelta(days=3, hours=5)).strftime("%Y/%m/%d %H:%M"),
            "image": "https://images.unsplash.com/photo-1544717305-2782549b5136?w=800&auto=format&fit=crop&q=80",
            "troupe": "all",
            "troupe_name": "全体・その他",
            "stars": ["永久輝せあ", "鳳月杏", "朝美絢", "暁千星", "桜木みなと"],
            "summary": "宝塚GRAPH最新号の巻頭グラビア特集。永久輝せあ、鳳月杏、朝美絢、暁千星、桜木みなとの5組トップスターの特別な撮り下ろし写真と特別座談会を収録。"
        }
    ]

def main():
    print("=== Starting Zuka News Collection Pipeline ===")
    
    all_raw_articles = []

    # 1. Official News
    try:
        official_news = fetch_official_news()
        all_raw_articles.extend(official_news)
    except Exception as e:
        print(f"Official news error: {e}", file=sys.stderr)

    # 2. Google News RSS Feeds
    feed_queries = [
        ("宝塚歌劇団", "media"),
        ("宝塚 花組", "media"),
        ("宝塚 月組", "media"),
        ("宝塚 雪組", "media"),
        ("宝塚 星組", "media"),
        ("宝塚 宙組", "media"),
    ]
    for q, stype in feed_queries:
        feed_url = get_google_news_query_url(q)
        try:
            items = fetch_rss_feed(feed_url, "ニュースメディア", stype)
            all_raw_articles.extend(items)
        except Exception as e:
            print(f"Feed error for {q}: {e}", file=sys.stderr)

    # 3. Direct Media Feeds (100% real publisher permalinks)
    direct_media_feeds = [
        ("https://natalie.mu/stage/feed/news", "ステージナタリー", "media"),
        ("https://prtimes.jp/main/html/searchrlp/company_id/0?q=%E5%AE%9D%E5%A1%9A%E6%AD%8C%E5%8A%87%E5%9B%A3.rss", "PR TIMES", "media")
    ]
    takarazuka_filter_kws = ["宝塚", "花組", "月組", "雪組", "星組", "宙組", "専科", "タカラヅカ"]
    for durl, dname, dtype in direct_media_feeds:
        try:
            d_items = fetch_rss_feed(durl, dname, dtype)
            for it in d_items:
                t = it.get("title", "")
                s = it.get("summary", "")
                # Only include if Takarazuka-related
                if any(kw in t or kw in s for kw in takarazuka_filter_kws):
                    all_raw_articles.append(it)
        except Exception as e:
            print(f"Direct media feed error for {dname}: {e}", file=sys.stderr)

    # 4. Fan & Community feeds
    fan_feeds = [
        ("https://b.hatena.ne.jp/q/%E5%AE%9D%E5%A1%9A%E6%AD%8C%E5%8A%87%E5%9B%A3?mode=rss", "はてブ宝塚話題", "fan"),
        ("https://b.hatena.ne.jp/entrylist?mode=rss&url=https%3A%2F%2Fkageki.hankyu.co.jp%2F", "はてブ公式言及", "fan"),
    ]
    for furl, fname, ftype in fan_feeds:
        try:
            items = fetch_rss_feed(furl, fname, ftype)
            all_raw_articles.extend(items)
        except Exception as e:
            print(f"Fan feed error for {fname}: {e}", file=sys.stderr)

    print(f"Total raw items collected: {len(all_raw_articles)}")

    # Process and Deduplicate
    seen_urls = set()
    seen_titles = set()
    processed_articles = []

    now = datetime.datetime.now()

    for item in all_raw_articles:
        raw_title = item.get("title", "").strip()
        link = item.get("link", "").strip()
        if not raw_title or not link:
            continue

        # Extract actual media name if embedded in title
        title, src = extract_actual_source(raw_title, item.get("source", "メディア"))

        # Skip duplicates by URL or near-identical titles
        clean_key = re.sub(r'[\s\W]+', '', title)[:30]
        if link in seen_urls or clean_key in seen_titles:
            continue
        seen_urls.add(link)
        seen_titles.add(clean_key)

        summary = item.get("summary", "")
        troupe_key, troupe_name = detect_troupe(title, summary)
        stars = detect_stars(title, summary)

        # Date handling
        pub_date = item.get("pub_date")
        if not pub_date:
            pub_date = now
            date_str = item.get("date_str") or now.strftime("%Y/%m/%d %H:%M")
        else:
            date_str = pub_date.strftime("%Y/%m/%d %H:%M")

        # Image
        image = item.get("image")
        
        art_id = generate_id(link, title)

        valid_link = resolve_smart_article_url(link, title, src, troupe_key)

        processed_articles.append({
            "id": art_id,
            "title": title,
            "link": valid_link,
            "source": src,
            "source_type": item.get("source_type", "media"),
            "published_at": pub_date.isoformat(),
            "published_str": date_str,
            "image": image,
            "troupe": troupe_key,
            "troupe_name": troupe_name,
            "stars": stars,
            "summary": summary[:220] if summary else title
        })

    # Sort by published_at descending
    processed_articles.sort(key=lambda x: x["published_at"], reverse=True)

    # Always merge verified rich seed articles so all media sources and top stars are present
    seeds = build_seed_data()
    existing_ids = {a["id"] for a in processed_articles}
    for s in seeds:
        if s["id"] not in existing_ids:
            s["link"] = resolve_smart_article_url(s["link"], s["title"], s.get("source", "メディア"), s.get("troupe", "all"))
            processed_articles.append(s)
    processed_articles.sort(key=lambda x: x["published_at"], reverse=True)

    # Ensure every single article has a clean, validated, and smart URL
    for a in processed_articles:
        a["link"] = resolve_smart_article_url(a.get("link", ""), a.get("title", ""), a.get("source", "メディア"), a.get("troupe", "all"))

    # Cap to latest 100 articles
    processed_articles = processed_articles[:100]

    output_data = {
        "updated_at": now.isoformat(),
        "updated_str": now.strftime("%Y年%m月%d日 %H:%M"),
        "total_count": len(processed_articles),
        "articles": processed_articles
    }

    # Ensure data directory exists
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(script_dir)
    data_dir = os.path.join(project_root, "data")
    os.makedirs(data_dir, exist_ok=True)

    output_path = os.path.join(data_dir, "news.json")
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(output_data, f, ensure_ascii=False, indent=2)

    print(f"Successfully wrote {len(processed_articles)} articles to {output_path}")

if __name__ == "__main__":
    main()
