import {
  useEffect
} from "react";
import {
  useLocation
} from "react-router-dom";

const DEFAULT_TITLE =
  "Tap & Wrap | Personalized Gifts in Egypt";

const DEFAULT_DESCRIPTION =
  "Shop thoughtful gifts, engraving, premium wrapping, photo printing, and custom gifting experiences from Tap & Wrap.";

const staticSeo = {
  "/": {
    title:
      DEFAULT_TITLE,

    description:
      DEFAULT_DESCRIPTION
  },

  "/shop": {
    title:
      "Shop Gifts | Tap & Wrap",

    description:
      "Browse Tap & Wrap gifts, personalized products, wrapping options, and thoughtful presents for every occasion."
  },

  "/services": {
    title:
      "Personalization Services | Tap & Wrap",

    description:
      "Request engraving, gift wrapping, photo printing, custom gifts, and corporate gifting from Tap & Wrap."
  },

  "/track-order": {
    title:
      "Track Your Order | Tap & Wrap",

    description:
      "Check the current status of your Tap & Wrap order using the order number and checkout email."
  },

  "/faq": {
    title:
      "Frequently Asked Questions | Tap & Wrap",

    description:
      "Answers about Tap & Wrap orders, personalization, payment, delivery, and customer support."
  },

  "/delivery-returns": {
    title:
      "Delivery & Returns | Tap & Wrap",

    description:
      "Read Tap & Wrap delivery fees, order checks, damaged-item support, and personalized-product return guidance."
  },

  "/privacy-policy": {
    title:
      "Privacy Policy | Tap & Wrap",

    description:
      "Learn how Tap & Wrap handles customer, order, payment, upload, and website information."
  },

  "/terms": {
    title:
      "Terms & Conditions | Tap & Wrap",

    description:
      "Read the terms that apply to Tap & Wrap orders, custom products, payments, delivery, and website use."
  },

  "/contact": {
    title:
      "Contact Tap & Wrap",

    description:
      "Contact Tap & Wrap for order support, custom gifting, engraving, wrapping, printing, or corporate requests."
  },

  "/cart": {
    title:
      "Your Cart | Tap & Wrap",

    description:
      "Review your Tap & Wrap cart before checkout.",

    noIndex:
      true
  },

  "/checkout": {
    title:
      "Secure Checkout | Tap & Wrap",

    description:
      "Complete your Tap & Wrap gift order securely.",

    noIndex:
      true
  },

  "/payment-result": {
    title:
      "Payment Result | Tap & Wrap",

    description:
      "Secure card payment result for a Tap & Wrap order.",

    noIndex:
      true
  }
};

function titleCaseSlug(value) {
  return String(value || "")
    .split("-")
    .filter(Boolean)
    .map(
      (part) =>
        part.charAt(0)
          .toUpperCase() +
        part.slice(1)
    )
    .join(" ");
}

function resolveSeo(pathname) {
  if (
    staticSeo[pathname]
  ) {
    return staticSeo[
      pathname
    ];
  }

  if (
    pathname.startsWith(
      "/products/"
    )
  ) {
    const slug =
      pathname
        .split("/")
        .filter(Boolean)
        .at(-1);

    const name =
      titleCaseSlug(
        slug
      );

    return {
      title:
        `${name} | Tap & Wrap`,

      description:
        `View ${name}, available gifting and personalization options, and secure ordering from Tap & Wrap.`
    };
  }

  if (
    pathname.startsWith(
      "/categories/"
    )
  ) {
    const slug =
      pathname
        .split("/")
        .filter(Boolean)
        .at(-1);

    const name =
      titleCaseSlug(
        slug
      );

    return {
      title:
        `${name} Gifts | Tap & Wrap`,

      description:
        `Browse ${name} gifts and personalized options from Tap & Wrap.`
    };
  }

  if (
    pathname.startsWith(
      "/order-success/"
    ) ||
    pathname.startsWith(
      "/admin"
    )
  ) {
    return {
      title:
        "Tap & Wrap",

      description:
        DEFAULT_DESCRIPTION,

      noIndex:
        true
    };
  }

  return {
    title:
      "Page Not Found | Tap & Wrap",

    description:
      "The requested Tap & Wrap page could not be found.",

    noIndex:
      true
  };
}

function upsertMeta(
  selector,
  attributes,
  content
) {
  let element =
    document.head.querySelector(
      selector
    );

  if (!element) {
    element =
      document.createElement(
        "meta"
      );

    Object.entries(
      attributes
    ).forEach(
      ([
        key,
        value
      ]) => {
        element.setAttribute(
          key,
          value
        );
      }
    );

    document.head.appendChild(
      element
    );
  }

  element.setAttribute(
    "content",
    content
  );
}

function upsertCanonical(
  url
) {
  let canonical =
    document.head.querySelector(
      'link[rel="canonical"]'
    );

  if (!canonical) {
    canonical =
      document.createElement(
        "link"
      );

    canonical.setAttribute(
      "rel",
      "canonical"
    );

    document.head.appendChild(
      canonical
    );
  }

  canonical.setAttribute(
    "href",
    url
  );
}

function upsertStructuredData(
  siteUrl
) {
  const scriptId =
    "tap-wrap-structured-data";

  let script =
    document.getElementById(
      scriptId
    );

  if (!script) {
    script =
      document.createElement(
        "script"
      );

    script.id =
      scriptId;

    script.type =
      "application/ld+json";

    document.head.appendChild(
      script
    );
  }

  script.textContent =
    JSON.stringify({
      "@context":
        "https://schema.org",

      "@graph": [
        {
          "@type":
            "Organization",

          "@id":
            `${siteUrl}/#organization`,

          name:
            "Tap & Wrap",

          url:
            siteUrl,

          logo:
            `${siteUrl}/icon-512.png`,

          sameAs: [
            "https://www.instagram.com/tapandwrap"
          ]
        },

        {
          "@type":
            "WebSite",

          "@id":
            `${siteUrl}/#website`,

          url:
            siteUrl,

          name:
            "Tap & Wrap",

          publisher: {
            "@id":
              `${siteUrl}/#organization`
          },

          inLanguage:
            "en"
        }
      ]
    });
}

export default function SeoManager() {
  const {
    pathname
  } = useLocation();

  useEffect(() => {
    const seo =
      resolveSeo(
        pathname
      );

    const configuredSiteUrl =
      String(
        import.meta.env
          .VITE_SITE_URL ||
          window.location.origin
      )
        .trim()
        .replace(/\/+$/, "");

    const canonicalUrl =
      `${configuredSiteUrl}${pathname}`;

    document.title =
      seo.title;

    upsertMeta(
      'meta[name="description"]',
      {
        name:
          "description"
      },
      seo.description
    );

    upsertMeta(
      'meta[name="robots"]',
      {
        name:
          "robots"
      },
      seo.noIndex
        ? "noindex, nofollow"
        : "index, follow, max-image-preview:large"
    );

    upsertMeta(
      'meta[property="og:title"]',
      {
        property:
          "og:title"
      },
      seo.title
    );

    upsertMeta(
      'meta[property="og:description"]',
      {
        property:
          "og:description"
      },
      seo.description
    );

    upsertMeta(
      'meta[property="og:url"]',
      {
        property:
          "og:url"
      },
      canonicalUrl
    );

    upsertMeta(
      'meta[property="og:type"]',
      {
        property:
          "og:type"
      },
      "website"
    );

    upsertMeta(
      'meta[property="og:site_name"]',
      {
        property:
          "og:site_name"
      },
      "Tap & Wrap"
    );

    upsertMeta(
      'meta[name="twitter:title"]',
      {
        name:
          "twitter:title"
      },
      seo.title
    );

    upsertMeta(
      'meta[name="twitter:description"]',
      {
        name:
          "twitter:description"
      },
      seo.description
    );

    upsertCanonical(
      canonicalUrl
    );

    upsertStructuredData(
      configuredSiteUrl
    );
  }, [
    pathname
  ]);

  return null;
}
