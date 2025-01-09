import axios, { AxiosRequestConfig, AxiosResponse } from "axios";
import * as cheerio from "cheerio";
import { Startup } from "@/types";
import { RateLimiter } from "@/lib/utils/rate-limiter";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const YC_BATCHES = ["W24"]; // Current year batches

const MAX_RETRIES = 3;
const RATE_LIMIT = 1; // requests per second
const rateLimiter = new RateLimiter(RATE_LIMIT);

async function fetchWithRetry(
  url: string,
  options: AxiosRequestConfig,
  retries = MAX_RETRIES
): Promise<AxiosResponse> {
  try {
    return await rateLimiter.add(() => axios.get(url, options));
  } catch (error) {
    if (
      retries > 0 &&
      axios.isAxiosError(error) &&
      error.response?.status === 429
    ) {
      console.log(`Rate limited, retrying... (${retries} attempts left)`);
      await delay(2000); // Wait longer between retries
      return fetchWithRetry(url, options, retries - 1);
    }
    throw error;
  }
}

async function getLinkedInUrl(companyName: string): Promise<string> {
  try {
    const response = await fetchWithRetry(
      `https://www.google.com/search?q=${encodeURIComponent(
        companyName + " LinkedIn company page"
      )}`,
      {
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "text/html",
          "Accept-Language": "en-US,en;q=0.9",
          Referer: "https://www.google.com/",
        },
      }
    );

    const $ = cheerio.load(response.data);
    const linkedInLink = $('a[href*="linkedin.com/company/"]').first();
    return linkedInLink.attr("href") || "";
  } catch (error) {
    console.error(`Error finding LinkedIn URL for ${companyName}:`, error);
    return "";
  }
}

interface ScrapedCompany {
  name: string;
  website?: string;
  linkedin_url?: string;
  source: string;
  batch?: string;
}

function validateCompany(company: Partial<Startup>): boolean {
  if (!company.name || company.name.trim().length < 2) return false;
  // Remove website validation since some companies might be stealth
  // if (company.website && !company.website.startsWith("http")) return false;
  // Remove LinkedIn validation since some companies might not have LinkedIn yet
  // if (company.linkedin_url && !company.linkedin_url.includes("linkedin.com")) return false;
  return true;
}

async function scrapeA16z(): Promise<Partial<Startup>[]> {
  const startups: ScrapedCompany[] = [];
  const processedNames = new Set<string>();

  // List of URLs to try
  const urls = ["https://a16z.com/portfolio/"];

  for (const url of urls) {
    try {
      console.log(`Trying A16Z URL: ${url}`);
      const response = await fetchWithRetry(url, {
        headers: {
          "User-Agent": USER_AGENT,
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
        },
      });

      console.log(`Got response from ${url}, status:`, response.status);
      const $ = cheerio.load(response.data);

      // Try different selectors for company elements
      const selectors = [
        ".company-grid-item",
        ".builder",
        "[data-v-7c2c5638].builder",
        "[data-filter-by]",
        "[data-name]",
        ".portfolio-company",
        ".portfolio-grid > div",
      ];

      for (const selector of selectors) {
        const items = $(selector).toArray();
        console.log(`Found ${items.length} items with selector: ${selector}`);

        if (items.length > 0) {
          console.log(`Using selector: ${selector}`);

          for (const item of items) {
            try {
              const element = $(item);
              let name =
                element.attr("data-name") || // Try data attribute first
                element.find(".builder-title span").text().trim() || // Try builder title
                element.find("h1,h2,h3,h4,h5,h6").first().text().trim(); // Try headings

              // Clean up the name
              if (name) {
                name = name.replace(/IPO:|Acquired By:/i, "").trim();
                console.log("Found company name:", name);

                if (!processedNames.has(name.toLowerCase())) {
                  const companyData: ScrapedCompany = {
                    name,
                    website: "not found", // We'll get this from LinkedIn
                    linkedin_url: await getLinkedInUrl(name),
                    source: "a16z",
                  };

                  if (validateCompany(companyData)) {
                    startups.push(companyData);
                    processedNames.add(name.toLowerCase());
                    console.log(`Successfully added ${name} to results`);
                  }
                }
              }
            } catch (error) {
              console.error("Error processing company element:", error);
            }
          }

          // If we found and processed companies with this selector, break the selector loop
          if (startups.length > 0) {
            break;
          }
        }
      }

      // If we found companies from this URL, break the URL loop
      if (startups.length > 0) {
        break;
      }
    } catch (error) {
      console.error(`Failed to fetch ${url}:`, error);
      // Continue to next URL
    }
  }

  if (startups.length === 0) {
    console.error("Failed to find any companies across all attempted URLs");
  }

  return startups;
}

function handleScrapingError(source: string, error: unknown) {
  console.error(`Error scraping ${source}:`, error);

  if (axios.isAxiosError(error)) {
    console.error({
      status: error.response?.status,
      statusText: error.response?.statusText,
      url: error.config?.url,
      headers: error.config?.headers,
      data: error.response?.data,
    });
  }

  // Could add error reporting service here
  // reportError(error);
}

export async function scrapeStartups(): Promise<Partial<Startup>[]> {
  console.time("scraping");
  const stats = {
    total: 0,
    a16z: 0,
    yc: 0,
    errors: 0,
  };

  try {
    const [a16zStartups, ycStartups] = await Promise.all([
      scrapeA16z(),
      scrapeYCombinator(),
    ]);

    stats.a16z = a16zStartups.length;
    stats.yc = ycStartups.length;
    stats.total = stats.a16z + stats.yc;

    console.log("\nScraping Statistics:", stats);
    console.timeEnd("scraping");

    return [...a16zStartups, ...ycStartups];
  } catch (error) {
    stats.errors++;
    handleScrapingError("Main", error);
    throw error;
  }
}

async function scrapeYCombinator(): Promise<Partial<Startup>[]> {
  const startups: Partial<Startup>[] = [];
  const processedNames = new Set<string>();

  for (const batch of YC_BATCHES) {
    let page = 0;
    let hasMore = true;
    let consecutiveErrors = 0;
    const MAX_CONSECUTIVE_ERRORS = 3;

    try {
      while (hasMore && consecutiveErrors < MAX_CONSECUTIVE_ERRORS) {
        console.log(`Fetching YC ${batch} batch, page ${page}...`);
        try {
          const response = await fetchWithRetry(
            `https://api.ycombinator.com/v0.1/companies?batch=${batch}&page=${page}&count=100`,
            {
              headers: {
                "User-Agent": USER_AGENT,
                Accept: "application/json",
                Origin: "https://www.ycombinator.com",
                Referer: "https://www.ycombinator.com/companies",
              },
            }
          );

          const companies = response.data.companies || [];
          console.log(`Found ${companies.length} YC companies on page ${page}`);

          if (companies.length === 0) {
            hasMore = false;
            break;
          }

          for (const company of companies) {
            if (
              company.name &&
              !processedNames.has(company.name.toLowerCase())
            ) {
              try {
                await delay(1000); // Rate limit LinkedIn requests
                const linkedin_url = await getLinkedInUrl(company.name);

                const startup: Partial<Startup> = {
                  name: company.name,
                  website: company.website || "not found",
                  linkedin_url: linkedin_url || "not found",
                  source: `YC ${batch}`,
                };

                if (validateCompany(startup)) {
                  startups.push(startup);
                  processedNames.add(company.name.toLowerCase());
                  console.log(
                    `Added YC company: ${company.name} (${startups.length} total)`
                  );
                } else {
                  console.log(`Skipped invalid company: ${company.name}`);
                }
              } catch (error) {
                console.error(
                  `Error processing company ${company.name}:`,
                  error
                );
                consecutiveErrors++;
              }
            }
          }

          consecutiveErrors = 0; // Reset error counter on success
          page++;

          // Check if we have more pages
          hasMore = response.data.next || response.data.nextPage;

          await delay(1000); // Rate limit between pages
        } catch (error) {
          console.error(`Error fetching page ${page}:`, error);
          consecutiveErrors++;
          await delay(5000); // Wait longer after an error
        }
      }
    } catch (error) {
      console.error(`Error scraping YC ${batch}:`, error);
    }
  }

  console.log(`Total YC companies scraped: ${startups.length}`);
  return startups;
}
