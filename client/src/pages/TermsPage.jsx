import Header from "../components/layout/Header";
import Footer from "../components/layout/Footer";
import PageIntro from "../components/content/PageIntro";

const sections = [
  {
    title:
      "Orders and acceptance",

    text:
      "Submitting an order creates a request to purchase. Tap & Wrap may review product availability, customization details, payment, delivery information, and suspected misuse before accepting or preparing the order."
  },

  {
    title:
      "Prices and promotions",

    text:
      "Prices, delivery fees, bundle offers, and discount codes are calculated by the website and verified again by the server. Promotions may have dates, product eligibility, quantity rules, usage limits, or other conditions."
  },

  {
    title:
      "Customer information",

    text:
      "Customers are responsible for providing accurate contact, recipient, address, spelling, engraving, image, and customization information. Tap & Wrap is not responsible for an error that follows information approved or submitted by the customer."
  },

  {
    title:
      "Payments",

    text:
      "Orders may use the payment methods shown at checkout. Manual transfers can remain under review until verified. Card payments are not considered paid until a valid confirmation is received from the payment provider."
  },

  {
    title:
      "Personalized and custom work",

    text:
      "Personalized, engraved, printed, and made-to-order products are created for a specific customer and may not be changed or cancelled after work begins. Customers must have permission to use any image, logo, text, artwork, or other content they upload."
  },

  {
    title:
      "Prohibited content",

    text:
      "Tap & Wrap may refuse content or requests that are illegal, infringe intellectual-property rights, threaten safety, contain abuse or hate, invade another person’s privacy, or are otherwise unsuitable for production."
  },

  {
    title:
      "Delivery",

    text:
      "Delivery timing is an estimate and may be affected by destination, courier operations, product availability, customization, weather, holidays, incorrect contact details, or circumstances outside reasonable control."
  },

  {
    title:
      "Returns and corrections",

    text:
      "Personalized items are generally not returnable due to a change of mind. Damaged, defective, or incorrect items should be reported promptly with the order number and supporting photos so Tap & Wrap can review an appropriate solution."
  },

  {
    title:
      "Website availability",

    text:
      "Tap & Wrap may update, suspend, or correct website content, products, prices, or features. Reasonable effort is made to keep information accurate, but temporary errors or interruptions may occur."
  },

  {
    title:
      "Limitation and applicable law",

    text:
      "Nothing in these terms removes rights that cannot legally be excluded. To the extent permitted by applicable law, responsibility is limited to the direct value of the affected order. These terms are intended to operate under applicable Egyptian law."
  },

  {
    title:
      "Changes and contact",

    text:
      "These terms may be updated when the store, providers, or legal requirements change. The version published on the website applies from its stated update date. Contact Tap & Wrap with questions before placing an order."
  }
];

export default function TermsPage() {
  return (
    <>
      <Header />

      <main
        id="main-content"
        className="mx-auto max-w-4xl px-5 py-14 md:py-18"
      >
        <PageIntro
          eyebrow="Legal"
          title="Terms & Conditions"
          description="The main rules for using the website, placing an order, submitting custom content, paying, and receiving Tap & Wrap products."
        />

        <p className="mt-6 text-sm text-[#806a62]">
          Last updated: July 10,
          2026
        </p>

        <div className="mt-10 grid gap-5">
          {sections.map(
            (
              section,
              index
            ) => (
              <section
                key={
                  section.title
                }
                className="rounded-[1.7rem] border border-[#ead9d2] bg-white/90 p-6 shadow-sm md:p-8"
              >
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#a77d70]">
                  {String(
                    index + 1
                  ).padStart(
                    2,
                    "0"
                  )}
                </p>

                <h2 className="mt-2 text-2xl font-semibold text-[#2c1f1b]">
                  {section.title}
                </h2>

                <p className="mt-4 leading-8 text-[#735f58]">
                  {section.text}
                </p>
              </section>
            )
          )}
        </div>

        <p className="mt-8 rounded-2xl bg-[#fff8f4] p-5 text-sm leading-7 text-[#735f58]">
          These terms should be
          reviewed before launch and
          whenever business policies
          or legal requirements
          change.
        </p>
      </main>

      <Footer />
    </>
  );
}
