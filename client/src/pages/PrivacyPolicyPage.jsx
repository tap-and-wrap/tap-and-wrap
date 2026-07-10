import Header from "../components/layout/Header";
import Footer from "../components/layout/Footer";
import PageIntro from "../components/content/PageIntro";

const sections = [
  {
    title:
      "Information we collect",

    paragraphs: [
      "Tap & Wrap may collect customer and recipient names, email addresses, phone numbers, delivery addresses, order notes, product selections, customization details, and service-request information.",
      "When a customer uploads an engraving image, payment proof, or service-request reference, the uploaded file and related technical information may be stored so the request can be completed.",
      "Basic technical information may also be processed for security, performance, error diagnosis, and prevention of abuse."
    ]
  },

  {
    title:
      "How information is used",

    paragraphs: [
      "Information is used to calculate prices, create and fulfil orders, manage stock, verify payments, deliver products, respond to support requests, provide order updates, prevent fraud, and improve the service.",
      "Tap & Wrap may contact customers about an order, payment, delivery, service request, quote, or issue that requires clarification."
    ]
  },

  {
    title:
      "Payments",

    paragraphs: [
      "Manual payment screenshots may be reviewed by authorized store administrators. Card payments, when enabled, are processed through Paymob’s hosted payment service.",
      "Tap & Wrap does not need to store a customer’s complete card number or card security code in its own website database."
    ]
  },

  {
    title:
      "Storage and service providers",

    paragraphs: [
      "Information may be stored or processed using hosting, database, image-storage, email, analytics, payment, and delivery service providers that are necessary to operate the store.",
      "Access should be limited to people and providers that need the information to perform their role."
    ]
  },

  {
    title:
      "Cookies and local browser storage",

    paragraphs: [
      "The website may use cookies for secure administrator authentication. Cart and recent-order information may be stored in the customer’s browser so the shopping and payment flow can work correctly.",
      "Customers can clear browser storage through their browser settings, although this may remove a saved cart or recent order reference."
    ]
  },

  {
    title:
      "Retention and security",

    paragraphs: [
      "Information is kept only as long as reasonably needed for orders, customer support, accounting, legal obligations, security, and dispute handling.",
      "Reasonable safeguards are used, but no internet system can guarantee absolute security."
    ]
  },

  {
    title:
      "Customer choices",

    paragraphs: [
      "A customer may contact Tap & Wrap to ask about personal information connected to an order, request a correction, or ask for deletion where deletion is legally and operationally permitted.",
      "Some records may need to be retained for completed transactions, fraud prevention, accounting, or legal requirements."
    ]
  }
];

export default function PrivacyPolicyPage() {
  return (
    <>
      <Header />

      <main
        id="main-content"
        className="mx-auto max-w-4xl px-5 py-14 md:py-18"
      >
        <PageIntro
          eyebrow="Legal"
          title="Privacy Policy"
          description="How Tap & Wrap collects, uses, stores, and protects information connected to orders, payments, uploads, and support."
        />

        <p className="mt-6 text-sm text-[#806a62]">
          Last updated: July 10,
          2026
        </p>

        <div className="mt-10 grid gap-5">
          {sections.map(
            (section) => (
              <section
                key={
                  section.title
                }
                className="rounded-[1.7rem] border border-[#ead9d2] bg-white/90 p-6 shadow-sm md:p-8"
              >
                <h2 className="text-2xl font-semibold text-[#2c1f1b]">
                  {section.title}
                </h2>

                <div className="mt-4 grid gap-4">
                  {section.paragraphs.map(
                    (
                      paragraph
                    ) => (
                      <p
                        key={
                          paragraph
                        }
                        className="leading-8 text-[#735f58]"
                      >
                        {paragraph}
                      </p>
                    )
                  )}
                </div>
              </section>
            )
          )}
        </div>

        <p className="mt-8 rounded-2xl bg-[#fff8f4] p-5 text-sm leading-7 text-[#735f58]">
          This policy is a practical
          website policy and should be
          reviewed whenever the
          business changes providers,
          payment methods, marketing
          practices, or legal
          requirements.
        </p>
      </main>

      <Footer />
    </>
  );
}
