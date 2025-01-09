import axios from "axios";
import * as cheerio from "cheerio";
import { Startup } from "@/types";
import { RateLimiter } from "@/lib/utils/rate-limiter";

const SCRAPING_BEE_API_KEY = process.env.SCRAPING_BEE_API_KEY;
if (!SCRAPING_BEE_API_KEY) {
  throw new Error("Missing SCRAPING_BEE_API_KEY environment variable");
}

const RATE_LIMIT = 0.5; // One request every 2 seconds
const rateLimiter = new RateLimiter(RATE_LIMIT);

async function fetchWithScrapingBee(
  url: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  retryCount = 0
): Promise<string> {
  const apiUrl = `https://app.scrapingbee.com/api/v1`;
  const params = {
    api_key: SCRAPING_BEE_API_KEY,
    url: url,
    render_js: "true",
    premium_proxy: "true",
    block_ads: "true",
    wait: "5000",
    timeout: "20000",
  };

  try {
    const response = await rateLimiter.add(() =>
      axios.get(apiUrl, {
        params,
        responseType: "text",
      })
    );
    return response.data;
  } catch (error) {
    console.error("ScrapingBee error:", error);
    throw error;
  }
}

async function scrapeA16z(): Promise<Partial<Startup>[]> {
  const startups: Partial<Startup>[] = [];
  const processedNames = new Set<string>();

  try {
    console.log("Fetching A16Z portfolio...");

    const html = await fetchWithScrapingBee("https://a16z.com/portfolio/");
    console.log("Got portfolio page HTML, length:", html.length);

    const $ = cheerio.load(html);

    // Enhanced selectors for company detection
    const selectors = [
      // Original selectors
      ".company-grid-item",
      "[data-filter-by]",
      // Data attribute selectors
      "[data-name]",
      "[data-secondary-name]",
      "[data-id]",
      // Class-based selectors
      ".column.grid-item",
      ".builder",
      ".portfolio-company",
      // Specific A16Z selectors
      "[data-v-7c2c5638].column",
      "[data-v-7c2c5638].builder",
      // Nested structure selectors
      ".builder-logo",
      ".builder-title",
      // Additional backup selectors
      ".portfolio-grid > div",
      ".company-list-item",
      ".startup-item",
    ];

    // Find all portfolio companies using multiple selectors
    const portfolioItems = $(selectors.join(", ")).toArray();
    console.log(`Found ${portfolioItems.length} total portfolio items`);

    for (const item of portfolioItems) {
      const element = $(item);

      // Enhanced company data extraction
      const companyData = {
        filterBy: element.attr("data-filter-by") || "",
        investmentDate: element.attr("data-investment-date") || "",
        name: (
          element.attr("data-name") ||
          element.attr("data-secondary-name") ||
          element.find(".builder-title span").text() ||
          element.find("h3").text() ||
          element.find(".company-name").text() ||
          ""
        ).trim(),
        website: (
          element.find("a").attr("href") ||
          element.attr("data-website") ||
          element.find(".website-link").attr("href") ||
          "not found"
        ).trim(),
      };

      // Check if investment was made in Q4 2024
      const isQ4_2024 =
        companyData.filterBy.includes("2024") &&
        (companyData.investmentDate.includes("Q4 2024") ||
          companyData.investmentDate.includes("October 2024") ||
          companyData.investmentDate.includes("November 2024") ||
          companyData.investmentDate.includes("December 2024") ||
          /2024-(10|11|12)/.test(companyData.investmentDate));

      if (!isQ4_2024) {
        console.log(`Skipping ${companyData.name}: Not a Q4 2024 investment`);
        continue;
      }

      // Skip exits
      if (companyData.filterBy.toLowerCase().includes("exit")) {
        console.log(`Skipping ${companyData.name}: Is an exit`);
        continue;
      }

      if (!companyData.name) {
        console.log("Skipping: No company name found");
        continue;
      }

      if (processedNames.has(companyData.name.toLowerCase())) {
        console.log(`Skipping ${companyData.name}: Already processed`);
        continue;
      }

      const startup: Partial<Startup> = {
        name: companyData.name,
        website:
          companyData.website !== "not found"
            ? companyData.website
            : "not found",
        linkedin_url: await getLinkedInUrl(companyData.name),
      };

      if (validateCompany(startup)) {
        startups.push(startup);
        processedNames.add(companyData.name.toLowerCase());
        console.log(`Successfully added Q4 2024 company: ${companyData.name}`);
      }
    }

    console.log(`Found ${startups.length} Q4 2024 A16Z investments`);
    return startups;
  } catch (error) {
    console.error("Error scraping A16Z investments:", error);
    throw error;
  }
}

async function getLinkedInUrl(companyName: string): Promise<string> {
  try {
    // First try direct LinkedIn search
    const linkedInSearchUrl = `https://www.linkedin.com/company/${encodeURIComponent(
      companyName.toLowerCase().replace(/[^a-z0-9]/g, "-")
    )}`;

    return linkedInSearchUrl; // Return the constructed URL without verification

    // Commenting out Google search approach due to rate limits
    /*
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(
      companyName + " LinkedIn company page"
    )}`;

    const html = await fetchWithScrapingBee(searchUrl);
    const $ = cheerio.load(html);
    const linkedInLink = $('a[href*="linkedin.com/company/"]').first();
    return linkedInLink.attr("href") || linkedInSearchUrl;
    */
  } catch (error) {
    console.error(`Error finding LinkedIn URL for ${companyName}:`, error);
    // Return a constructed LinkedIn URL instead of empty string
    return `https://www.linkedin.com/company/${encodeURIComponent(
      companyName.toLowerCase().replace(/[^a-z0-9]/g, "-")
    )}`;
  }
}

function validateCompany(company: Partial<Startup>): boolean {
  if (!company.name || company.name.trim().length < 2) {
    console.log("Validation failed: Invalid name");
    return false;
  }

  // Add any company that has a name
  return true;
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
    yc: 0, // Uncommented YC stats
    errors: 0,
  };

  try {
    // Parallel scraping of both sources
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

// Uncomment and update YC scraper
async function scrapeYCombinator(): Promise<Partial<Startup>[]> {
  const startups: Partial<Startup>[] = [];
  const processedNames = new Set<string>();
  const YC_BATCHES = ["W24"];

  for (const batch of YC_BATCHES) {
    let page = 0; // Start from page 0
    let hasMore = true;
    let consecutiveErrors = 0;
    const MAX_CONSECUTIVE_ERRORS = 3;

    try {
      while (hasMore && consecutiveErrors < MAX_CONSECUTIVE_ERRORS) {
        console.log(`Fetching YC ${batch} batch, page ${page}...`);
        try {
          const response = await fetchWithScrapingBee(
            `https://api.ycombinator.com/v0.1/companies?batch=${batch}&page=${page}&count=100`
          );

          const data = JSON.parse(response);
          const companies = data.companies || [];
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
                await rateLimiter.add(() => Promise.resolve());

                const startup: Partial<Startup> = {
                  name: company.name,
                  website: company.website || "not found",
                  linkedin_url: await getLinkedInUrl(company.name),
                };

                if (validateCompany(startup)) {
                  startups.push(startup);
                  processedNames.add(company.name.toLowerCase());
                  console.log(
                    `Added YC company: ${company.name} (${startups.length} total)`
                  );
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

          consecutiveErrors = 0;
          page++;

          // Check if we have more pages using the API's next page indicator
          hasMore = data.next || data.nextPage;

          await rateLimiter.add(() => Promise.resolve());
        } catch (error) {
          console.error(`Error fetching page ${page}:`, error);
          consecutiveErrors++;
          await new Promise((resolve) => setTimeout(resolve, 5000));
        }
      }
    } catch (error) {
      console.error(`Error scraping YC ${batch}:`, error);
    }
  }

  console.log(`Total YC companies scraped: ${startups.length}`);
  return startups;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface ScrapedCompany {
  // ...
}
