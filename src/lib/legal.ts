/**
 * Terms of use and privacy notice for the staff portal. Plain-language drafts
 * describing what this app actually does; the company should have them
 * reviewed (HR, and whoever handles PDPA matters) before relying on them.
 * Bump LEGAL_UPDATED when the wording changes.
 */
export const LEGAL_UPDATED = "19 October 2026"

export type LegalDoc = { title: string; intro: string; sections: { heading: string; body: string[] }[] }

const COMPANY = "CREOX Computing Singapore Pte. Ltd."
const CONTACT =
  "Questions about these terms, or requests to access or correct your personal data, go to Human Resources at CREOX Computing Singapore Pte. Ltd., 9 Temasek Boulevard #26-03, Suntec Tower 2, Singapore 038989."

export const LEGAL: Record<"terms" | "privacy", LegalDoc> = {
  terms: {
    title: "Terms of use",
    intro: `The CREOX Staff Portal is run by ${COMPANY} ("the company") for its employees. By signing in, you agree to use it on these terms. They sit alongside the company's employment terms and policies, which take precedence where the two differ.`,
    sections: [
      {
        heading: "Who may use it",
        body: [
          "The portal is for current employees, who sign in with their company Microsoft 365 account. Access ends when that account is closed.",
        ],
      },
      {
        heading: "Your requests",
        body: [
          "Submit only genuine work requests: expenses you incurred for company work, leave you intend to take, and travel and purchases the company needs.",
          "Make sure amounts, dates, receipts and other details are accurate and complete. Attach the original receipt or document, not an altered copy.",
          "Expense claims, leave, travel and purchases remain subject to the company's policies on each. Submitting a request does not mean it will be approved.",
        ],
      },
      {
        heading: "Approvals",
        body: [
          "Approvers should approve only requests they have the authority to approve and have checked. A drawn signature on an approval is recorded with your name and the time, and is treated as your approval.",
          "Approval links are personal to the named approver. Do not forward them or approve on someone else's behalf.",
        ],
      },
      {
        heading: "Keeping it secure",
        body: [
          "Do not share your sign-in or let others use the portal as you. Sign out on shared devices; the portal also signs you out after 30 minutes without activity.",
          "Report anything that looks wrong, such as a request you did not make, to Human Resources or IT straight away.",
        ],
      },
      {
        heading: "Misuse",
        body: [
          "False or inflated claims, using another person's account, or trying to see or change other people's requests may lead to action under the company's disciplinary policy, and the company may recover any amount paid out wrongly.",
        ],
      },
      {
        heading: "Availability and changes",
        body: [
          "The company aims to keep the portal available and accurate, but it may be unavailable at times. If it is, follow your manager's or Human Resources' instructions for urgent requests.",
          "The company may update these terms. The date at the top shows when they last changed.",
          "These terms are governed by the laws of Singapore.",
        ],
      },
      { heading: "Contact", body: [CONTACT] },
    ],
  },
  privacy: {
    title: "Privacy notice",
    intro: `This notice explains how ${COMPANY} collects, uses and discloses personal data through the CREOX Staff Portal, in line with Singapore's Personal Data Protection Act (PDPA).`,
    sections: [
      {
        heading: "What is collected",
        body: [
          "From your Microsoft 365 account: your name, work email address and job title.",
          "What you enter: your department, and the details of each request, such as expense amounts and categories, leave dates and reasons, travel plans and costs, and purchase details.",
          "Files you attach, such as receipts, medical certificates and quotations.",
          "For approvers: decisions, comments, and the signature you draw, with the time of each decision.",
          "The time each request is submitted, changed or reminded about.",
        ],
      },
      {
        heading: "How it is used",
        body: [
          "To process your requests: routing them to the right approvers, reimbursing expenses, recording leave, and arranging travel and purchases.",
          "To keep accounting, tax and employment records the company is required to keep, and to check requests against company policy.",
        ],
      },
      {
        heading: "Where it is kept",
        body: [
          "Requests, attachments and signed documents are stored in the company's own Microsoft 365 (SharePoint), and notifications are sent from the company mailbox.",
          "The portal itself runs on Vercel, which handles your requests as they pass through and keeps only short-lived technical logs. Exchange rates come from a public rate service; no personal data is sent to it.",
        ],
      },
      {
        heading: "Who can see it",
        body: [
          "You, the approvers on your request, Finance and Human Resources, and the IT administrators who look after the company's Microsoft 365. The company does not sell it, and shares it outside the company only with the service providers named above or where the law requires.",
        ],
      },
      {
        heading: "On your device",
        body: [
          "The portal uses no advertising or tracking cookies. Your sign-in is held only for the browser session and is cleared when you close the browser or sign out.",
          "It remembers your light or dark choice, and whether you have signed in on this device before, in your browser's storage. Neither contains your requests.",
        ],
      },
      {
        heading: "How long we keep it",
        body: [
          "Records are kept for as long as the company's record-keeping and legal obligations require, then deleted. A request you delete before anyone approves it leaves the portal straight away, along with its attachments, and is cleared from the company's SharePoint recycle bin after its normal retention period.",
        ],
      },
      {
        heading: "Your rights",
        body: [
          "You may ask to see the personal data the company holds about you through the portal, or to correct it if it is wrong.",
        ],
      },
      { heading: "Contact", body: [CONTACT] },
    ],
  },
}
