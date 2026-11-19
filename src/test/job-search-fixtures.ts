// Answers from job sources for the tests (E14), in each source's own shape,
// with made-up companies and people.

const ledgerly = {
  job_id: "aG9tZWQtZGVzaWduZXItbGVkZ2VybHk=",
  job_title: "Senior Product Designer, Payments",
  employer_name: "Ledgerly",
  employer_logo: "https://example.com/ledgerly.png",
  job_publisher: "LinkedIn",
  job_employment_type: "Full-time",
  job_apply_link: "https://www.linkedin.com/jobs/view/1234567890?utm_source=google_jobs_apply",
  job_apply_is_direct: false,
  apply_options: [
    { publisher: "LinkedIn", apply_link: "https://www.linkedin.com/jobs/view/1234567890?utm_source=google_jobs_apply", is_direct: false },
    { publisher: "Ledgerly Careers", apply_link: "https://careers.ledgerly.example/jobs/42", is_direct: true },
  ],
  job_description: "Ledgerly is hiring a Senior Product Designer for its payments team.\n\nYou'll design checkout flows.\n\n• 5+ years of product design\n• Figma",
  job_is_remote: false,
  job_posted_at_datetime_utc: "2026-09-30T08:00:00.000Z",
  job_posted_at_timestamp: 1790755200,
  // As JSearch writes it: in the country's language, with the publisher.
  job_location: "Hamburg     •  über LinkedIn",
  job_city: null,
  job_state: null,
  job_country: "DE",
  job_latitude: 53.55,
  job_longitude: 9.99,
  job_min_salary: 75000,
  job_max_salary: 90000,
  job_salary_currency: "EUR",
  job_salary_period: "YEAR",
  job_google_link: "https://www.google.com/search?q=jobs&ibp=htl;jobs#htidocid=abc",
};

const northwind = {
  job_id: "bm9ydGh3aW5kLXV4LXJlc2VhcmNo",
  job_title: "UX Researcher",
  employer_name: "Northwind Studio",
  job_publisher: "Indeed",
  job_apply_link: "https://de.indeed.com/viewjob?jk=abc123&from=serp",
  apply_options: [{ publisher: "Indeed", apply_link: "https://de.indeed.com/viewjob?jk=abc123&from=serp", is_direct: false }],
  job_description: "Northwind Studio is looking for a UX Researcher, fully remote within Germany.",
  job_is_remote: true,
  job_posted_at_datetime_utc: null,
  job_posted_at_timestamp: 1790582400,
  job_location: null,
  job_city: "Berlin",
  job_state: null,
  job_country: "DE",
  job_min_salary: null,
  job_max_salary: null,
  job_salary_currency: null,
  job_salary_period: null,
};

/** OpenWeb Ninja's search-v2: jobs and the next page's cursor under `data`. */
export const jsearchV2Page = {
  status: "OK",
  request_id: "c8f1b2a4-0000-4000-8000-000000000001",
  parameters: { query: "product designer in Hamburg", country: "de" },
  data: {
    jobs: [
      ledgerly,
      northwind,
      // Repeated across publishers: kept once.
      ledgerly,
      // Without an id: skipped.
      { job_title: "No id" },
    ],
    cursor: "CURSOR-PAGE-2",
  },
};

/** The last search-v2 page: no cursor. */
export const jsearchV2LastPage = { status: "OK", request_id: "r2", parameters: {}, data: { jobs: [northwind], cursor: null } };

/** What JSearch says to a key it doesn't know. */
export const jsearchKeyError = { status: "ERROR", request_id: "r4", error: { message: "Invalid API key", code: 401 } };

/** Adzuna's search, as its docs describe it: a snippet with HTML, the company and place as objects. */
export const adzunaPage = {
  __CLASS__: "Adzuna::API::Response::JobSearchResults",
  count: 45,
  mean: 61000,
  results: [
    {
      __CLASS__: "Adzuna::API::Response::Job",
      id: "4721394012",
      adref: "eyJhbGciOiJIUzI1NiJ9",
      title: "Senior <strong>Product Designer</strong> &amp; Researcher",
      description: "Ledgerly is hiring a <strong>Product Designer</strong> for its payments team…",
      created: "2026-09-29T09:15:00Z",
      redirect_url: "https://www.adzuna.de/land/ad/4721394012?se=abc&utm_medium=api&utm_source=dossier&v=1",
      company: { __CLASS__: "Adzuna::API::Response::Company", display_name: "Ledgerly GmbH" },
      location: { __CLASS__: "Adzuna::API::Response::Location", display_name: "Hamburg, Deutschland", area: ["Deutschland", "Hamburg"] },
      salary_min: 70000,
      salary_max: 85000,
      salary_is_predicted: "1",
      contract_time: "full_time",
      category: { label: "IT-Stellen", tag: "it-jobs" },
      latitude: 53.55,
      longitude: 9.99,
    },
    {
      id: 4721394013,
      title: "UX Researcher",
      description: null,
      created: "not a date",
      redirect_url: "javascript:alert(1)",
      company: null,
      location: { display_name: "Berlin" },
    },
    // Without an id: skipped.
    { title: "No id" },
  ],
};

/** The Arbeitsagentur's v6 search, as it answered on 3 October 2026 (company and address made up). */
export const arbeitsagenturPage = {
  ergebnisliste: [
    {
      stellenangebotsart: "ARBEIT",
      stellenangebotsTitel: "Softwareentwickler (m/w/d)",
      arbeitszeitVollzeit: true,
      stellenlokationen: [
        { adresse: { strasse: "Hafenstraße", plz: "20457", ort: "Hamburg", region: "HAMBURG", land: "DEUTSCHLAND" }, breite: 53.54, laenge: 10.0 },
        { adresse: { plz: "23552", ort: "Lübeck", region: "SCHLESWIG_HOLSTEIN", land: "DEUTSCHLAND" } },
        { adresse: { ort: "Hamburg" } },
      ],
      homeofficemoeglich: true,
      homeofficetyp: "ANGABE_IN_PROZENT",
      homeofficeprozent: 60,
      datumErsteVeroeffentlichung: "2026-09-28",
      firma: "Hafenlogik GmbH",
      referenznummer: "10001-1003486534-S",
      entfernung: 3,
      gehaltsspanneVon: 55000,
      gehaltsspanneBis: 68000,
    },
    {
      stellenangebotsTitel: "Remote Backend Developer",
      stellenlokationen: [],
      homeofficeprozent: 100,
      firma: "Nordlicht Software",
      referenznummer: "12265-0000912345-S",
      externeURL: "https://karriere.nordlicht.example/jobs/7",
      datumErsteVeroeffentlichung: null,
    },
    // Without a reference number: skipped.
    { stellenangebotsTitel: "No reference" },
  ],
  maxErgebnisse: 60,
  page: 1,
  size: 25,
  woOutput: { suchmittelpunkt: { lat: 53.55, lon: 9.99 } },
  facetten: {},
};

/** The Arbeitsagentur's v4 job details: the description in light Markdown. */
export const arbeitsagenturDetails = {
  stellenangebotsTitel: "Softwareentwickler (m/w/d)",
  stellenangebotsBeschreibung: "**Wer wir sind**\r\nHafenlogik baut Software für den Hafen.\r\n\r\n\r\n**Was du machst**\n- APIs bauen\n- Tests schreiben",
  referenznummer: "10001-1003486534-S",
};

/** FreeHire's agent search: full plain-text descriptions in the list. */
export const freehirePage = {
  data: [
    {
      public_slug: "senior-go-engineer-acme-1a2b",
      source: "greenhouse",
      title: "Senior Go Engineer",
      company: "Acme",
      location: "Remote — EU",
      url: "https://boards.greenhouse.io/acme/jobs/123",
      work_mode: "remote",
      posted_at: "2026-06-18T00:00:00Z",
      description: "Acme is hiring a Senior Go Engineer.\n\nYou'll build APIs.",
      enrichment: {
        salary_min: 90000,
        salary_max: 130000,
        salary_currency: "EUR",
        salary_period: "year",
      },
    },
    {
      public_slug: "ux-researcher-northwind",
      source: "lever",
      title: "UX Researcher",
      company: "Northwind Studio",
      location: "Berlin",
      url: "javascript:alert(1)",
      work_mode: "onsite",
      posted_at: "not a date",
      description: null,
      enrichment: null,
    },
    // Repeated slug: kept once.
    {
      public_slug: "senior-go-engineer-acme-1a2b",
      title: "Duplicate",
      company: "Acme",
      url: "https://boards.greenhouse.io/acme/jobs/123",
    },
    // Without a slug: skipped.
    { title: "No slug" },
  ],
  meta: { total: 45, limit: 20, offset: 0 },
};

/** FreeHire's last page: fewer than a full page of results. */
export const freehireLastPage = {
  data: [
    {
      public_slug: "design-systems-canal",
      source: "ashby",
      title: "Design Systems Designer",
      company: "Canal Software",
      location: "Amsterdam",
      url: "https://jobs.ashbyhq.com/canal/abc",
      work_mode: "hybrid",
      posted_at: "2026-09-01T12:00:00Z",
      description: "Canal Software needs a design-systems designer.",
      enrichment: { salary_min: 52000, salary_max: 52000, salary_currency: "EUR", salary_period: "year" },
    },
  ],
  meta: { total: 21, limit: 20, offset: 20 },
};

/** merojob's browse API: each result carries its own description and specification. */
export const merojobPage = {
  count: 45,
  next: "https://api.merojob.com/api/v1/jobs/?limit=20&offset=20",
  previous: null,
  results: [
    {
      id: 204743,
      title: "Full-Stack Developer",
      slug: "full-stack-developer-245",
      absolute_url: "/full-stack-developer-245/",
      client: { id: 2178, client_name: "Himalayan Software", verified: true },
      description: "<p>We are hiring a <strong>Full-Stack Developer</strong> for our Kathmandu office.</p><ul><li>React and Node</li></ul>",
      specification: "<ul><li>Bachelor's in Computer Science</li><li>2+ years of experience</li></ul>",
      job_summary: "Build web applications with React and Node.",
      hide_org_name: false,
      hide_salary: false,
      posted_at: "2026-11-16T04:26:29.127639Z",
      offered_salary: { id: 1420, currency: "NRs", minimum: 90000, maximum: 120000, unit: "Monthly" },
      job_locations: [{ id: 1, name: null, address: "Jawalakhel, Lalitpur", district: null, country: null }],
    },
    {
      id: 204744,
      title: "Remote Backend Developer",
      slug: "remote-backend-developer-246",
      absolute_url: "/remote-backend-developer-246/",
      client: { id: 2179, client_name: "Hidden Employer" },
      description: "<p>A fully remote backend role.</p>",
      specification: null,
      hide_org_name: true,
      hide_salary: true,
      posted_at: "2026-11-15T08:00:00Z",
      offered_salary: { currency: "NRs", minimum: 80000, maximum: null, unit: "Monthly" },
      job_locations: [{ address: "Kathmandu", district: null, country: null }],
    },
    // Repeated id: kept once.
    { id: 204743, title: "Duplicate", client: { client_name: "Himalayan Software" } },
    // Without an id: skipped.
    { title: "No id" },
  ],
};

/** merojob's last page: fewer than a full page of results. */
export const merojobLastPage = { count: 45, next: null, previous: null, results: [] };

/** Hacker News' search by date, with YC companies' job stories. */
export const ycPage = {
  hits: [
    {
      objectID: "50452404",
      title: "Tinfoil (YC P25) is hiring an applied AI security engineer in San Francisco",
      url: null,
      story_text: null,
      created_at: "2026-11-11T12:00:35Z",
      created_at_i: 1762862435,
    },
    {
      objectID: "50391342",
      title: "Mbodi AI (YC P25) Is Hiring Research and Robotic Engineers",
      url: "https://www.ycombinator.com/companies/mbodi-ai/jobs",
      story_text: null,
      created_at: "2026-11-06T12:00:42Z",
      created_at_i: 1762430442,
    },
    {
      objectID: "50381512",
      title: "Sava Trust (YC F25) Is Hiring a Founding Engineer in NYC",
      url: "",
      story_text: "<p>Build the future of escrow.</p>",
      created_at: "2026-11-05T17:01:23Z",
      created_at_i: 1762358483,
    },
    {
      objectID: "50399999",
      title: "Nimbus (YC W24) Is Hiring a Remote Platform Engineer",
      url: "https://nimbus.example/jobs/1",
      story_text: null,
      created_at: "2026-11-04T09:00:00Z",
      created_at_i: 1762246800,
    },
    // Without a title: skipped.
    { objectID: "1", url: "https://example.com/jobs" },
  ],
  nbHits: 30,
  nbPages: 2,
  page: 0,
  hitsPerPage: 20,
};

/** Hacker News' last page. */
export const ycLastPage = {
  hits: [
    {
      objectID: "50339827",
      title: "Bitmovin (YC S15) Is Hiring Technical Graduates in Denver",
      url: "https://bitmovin.com/careers/8660599002/",
      created_at: "2026-11-02T17:00:41Z",
      created_at_i: 1762093241,
    },
  ],
  nbHits: 21,
  nbPages: 1,
  page: 1,
  hitsPerPage: 20,
};

/** Remotive's search proxy: its own hits, with the location filters its search uses. */
const remotiveEngineer = {
  id: "6648271",
  title: "<em>Python</em> Typescript Engineer",
  skills: ["python", "typescript"],
  company_name: "Turing Enterprise Inc.",
  locations: ["Worldwide"],
  url: "https://jobs.workable.com/view/abc/remote-python-typescript-engineer",
  salary: "unspecified",
  category: "Software Development",
  seniority: "mid-level",
  job_type: "contract",
  discovered_on: "2026-11-18 22:31:20",
  remotive_com_url: "https://remotive.com/remote/jobs/software-development/python-typescript-engineer-6648271",
};

const remotiveDesigner = {
  id: "6648272",
  title: "Senior Product Designer",
  company_name: "Harbourlight",
  locations: ["Berlin", "Germany"],
  url: "https://harbourlight.example/jobs/1",
  salary: "€75,000–90,000",
  category: "Design",
  job_type: "full-time",
  discovered_on: "2026-11-17 09:00:00",
  remotive_com_url: "https://remotive.com/remote/jobs/design/senior-product-designer-6648272",
};

const remotiveOld = {
  id: "6648273",
  title: "Platform Engineer",
  company_name: "Ledgerly",
  locations: ["Germany"],
  url: "https://ledgerly.example/jobs/2",
  salary: "€70,000",
  category: "Engineering",
  job_type: "full-time",
  discovered_on: "2026-01-05 08:00:00",
  remotive_com_url: "https://remotive.com/remote/jobs/engineering/platform-engineer-6648273",
};

/** Remotive's first page. */
export const remotivePage = {
  jsonrpc: "2.0",
  id: null,
  result: {
    results: [
      {
        // As its search highlights the words it matched.
        hits: [remotiveEngineer, remotiveDesigner, remotiveOld, remotiveEngineer, { id: "no-title", remotive_com_url: "https://remotive.com/x" }],
        nbHits: 5,
        page: 0,
        nbPages: 2,
        hitsPerPage: 20,
      },
    ],
  },
};

/** Remotive's last page. */
export const remotiveLastPage = {
  jsonrpc: "2.0",
  id: null,
  result: { results: [{ hits: [], nbHits: 21, page: 1, nbPages: 1, hitsPerPage: 20 }] },
};
