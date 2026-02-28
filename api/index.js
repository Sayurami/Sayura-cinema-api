import axios from "axios";
import * as cheerio from "cheerio";

const BASE_URL = "https://movie-web-rust-eight.vercel.app";

// ===============================
// FETCH PAGE
// ===============================
async function fetchPage(url) {
  try {
    const res = await axios.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0"
      },
      timeout: 20000
    });

    return res.data;
  } catch (err) {
    return null;
  }
}

// ===============================
// MAIN HANDLER
// ===============================
export default async function handler(req, res) {

  const { q, url } = req.query;

  // ======================================================
  // 🔎 SEARCH API
  // ======================================================
  if (q) {

    const html = await fetchPage(
      `${BASE_URL}/movies?search=${encodeURIComponent(q)}`
    );

    if (!html)
      return res.json({ status: false, message: "Search failed" });

    const $ = cheerio.load(html);
    const results = [];

    $("a[href^='/movie/']").each((i, el) => {
      const link = $(el).attr("href");
      const title = $(el).text().trim();
      const image = $(el).find("img").attr("src");

      if (link && title) {
        results.push({
          title,
          image: image || null,
          url: `${BASE_URL}${link}`
        });
      }
    });

    const unique = Array.from(
      new Map(results.map(item => [item.url, item])).values()
    );

    return res.json({
      status: true,
      total: unique.length,
      results: unique
    });
  }

  // ======================================================
  // 🎬 DETAILS API
  // ======================================================
  if (url) {

    const html = await fetchPage(url);

    if (!html)
      return res.json({ status: false, message: "Details fetch failed" });

    const $ = cheerio.load(html);

    const title = $("h1").first().text().trim();
    const description = $("p").first().text().trim();
    const poster = $("img").first().attr("src") || null;

    const downloads = [];
    const streams = [];
    let episodes = [];

    // ===============================
    // DOWNLOAD + STREAM
    // ===============================
    $("a").each((i, el) => {
      const href = $(el).attr("href");
      const text = $(el).text().trim();
      if (!href) return;

      if (/(720p|1080p|480p|BluRay|WEB|Download)/i.test(text)) {
        downloads.push({
          quality: text,
          url: href.startsWith("http") ? href : `${BASE_URL}${href}`
        });
      }

      if (/(Watch|Stream|Play)/i.test(text)) {
        streams.push({
          label: text,
          url: href.startsWith("http") ? href : `${BASE_URL}${href}`
        });
      }
    });

    // ======================================================
    // 🔥 TRY INTERNAL API FOR EPISODES
    // ======================================================
    try {
      const movieIdMatch = url.match(/movie\/([^/?]+)/);
      const movieId = movieIdMatch ? movieIdMatch[1] : null;

      if (movieId) {
        const apiRes = await axios.get(
          `${BASE_URL}/api/movies/${movieId}`
        );

        if (apiRes.data?.episodes) {
          episodes = apiRes.data.episodes
            .filter(ep => ep && ep.title && ep.url)
            .map(ep => ({
              title: ep.title.trim(),
              number: ep.number || null,
              url: ep.url
            }));
        }
      }
    } catch (err) {}

    // ======================================================
    // 🔥 IF STILL EMPTY → TRY __NEXT_DATA__
    // ======================================================
    if (episodes.length === 0) {
      const script = $("script#__NEXT_DATA__").html();

      if (script) {
        try {
          const json = JSON.parse(script);
          const pageProps = json?.props?.pageProps;

          const rawEpisodes =
            pageProps?.episodes ||
            pageProps?.movie?.episodes ||
            [];

          if (Array.isArray(rawEpisodes)) {
            episodes = rawEpisodes
              .filter(ep => ep && ep.title && ep.url)
              .map(ep => ({
                title: ep.title.trim(),
                number: ep.number || null,
                url: ep.url
              }));
          }

        } catch (err) {}
      }
    }

    // ======================================================
    // 🔥 REMOVE DUPLICATES
    // ======================================================
    episodes = Array.from(
      new Map(
        episodes
          .filter(ep => ep.title && ep.url)
          .map(ep => [ep.url, ep])
      ).values()
    );

    return res.json({
      status: true,
      data: {
        title,
        description,
        poster,
        downloads,
        streams,
        episodes
      }
    });
  }

  // ======================================================
  // DEFAULT RESPONSE
  // ======================================================
  return res.json({
    status: true,
    message: "Sayura API Running 🚀"
  });
}
