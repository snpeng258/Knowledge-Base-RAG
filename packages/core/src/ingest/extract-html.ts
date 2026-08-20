export type ExtractedArticle = {
  title: string;
  content: string;
  occurredAt: Date | null;
  parserTried: string[];
};

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function innerText(html: string): string {
  const withoutChrome = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ");
  return decodeEntities(withoutChrome.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

function metaContent(html: string, property: string): string | undefined {
  const pattern = new RegExp(
    `<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']+)["']`,
    "i",
  );
  const alt = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${property}["']`,
    "i",
  );
  return html.match(pattern)?.[1] ?? html.match(alt)?.[1];
}

function firstMatch(html: string, tag: string): string | undefined {
  const match = html.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match?.[1];
}

export function extractArticle(html: string, fallbackTitle: string): ExtractedArticle {
  const parserTried: string[] = [];
  const title =
    metaContent(html, "og:title") ?? innerText(firstMatch(html, "title") ?? "") ?? fallbackTitle;
  const published = metaContent(html, "article:published_time") ?? metaContent(html, "date");
  const timeTag = html.match(/<time[^>]+datetime=["']([^"']+)["']/i)?.[1];
  const occurredRaw = published ?? timeTag;
  const occurredAt = occurredRaw !== undefined && occurredRaw.length > 0 ? new Date(occurredRaw) : null;

  let content = "";
  const article = firstMatch(html, "article");
  if (article !== undefined) {
    parserTried.push("html-article");
    content = innerText(article);
  }
  if (content.length === 0) {
    const main = firstMatch(html, "main");
    if (main !== undefined) {
      parserTried.push("html-main");
      content = innerText(main);
    }
  }
  if (content.length === 0) {
    parserTried.push("html-p");
    const paragraphs = [...html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)].map((row) => innerText(row[1] ?? ""));
    content = paragraphs.filter((row) => row.length > 0).join("\n\n");
  }

  return {
    title: title.length > 0 ? title : fallbackTitle,
    content,
    occurredAt: occurredAt !== null && !Number.isNaN(occurredAt.getTime()) ? occurredAt : null,
    parserTried,
  };
}
