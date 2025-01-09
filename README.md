# Startup Tracker

A web application that automatically tracks and displays startups from Y Combinator's W24 batch and Andreessen Horowitz's portfolio companies.

## Features

- Automated scraping of YC and A16Z portfolio companies
- Real-time data refresh capability
- Company information display including:
  - Company name
  - Website
  - LinkedIn profile
  - Source (YC W24 or A16Z Q4 2024)
- Pagination and sorting of results
- Rate-limited scraping to respect API limits

## Tech Stack

- **Framework**: Next.js 14 with App Router
- **Language**: TypeScript
- **Database**: Supabase (PostgreSQL)
- **UI Components**:
  - Shadcn/ui
  - Tailwind CSS
- **Data Fetching**:
  - Axios
  - ScrapingBee for reliable web scraping
- **State Management**: React Hooks
- **Rate Limiting**: Custom implementation

## Getting Started

1. Clone the repository
2. Install dependencies:

```bash
npm install
```

3. Set up environment variables:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SCRAPING_BEE_API_KEY=your_scraping_bee_api_key
```

4. Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the application.

## API Routes

- `GET /api/scrape`: Triggers a new scrape of YC and A16Z startups

## Required Services

1. **Supabase Account**

   - Set up a new project
   - Create a `startups` table with the required schema
   - Get your project URL and anon key

2. **ScrapingBee Account**
   - Sign up at [ScrapingBee](https://www.scrapingbee.com)
   - Get your API key
   - Used for reliable web scraping with proxy rotation and JavaScript rendering

## License

[MIT](https://choosealicense.com/licenses/mit/)
