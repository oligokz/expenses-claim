// This page redirects to the static HTML file in /public/index.html
// The actual UI lives there as plain HTML/JS — no React needed for the frontend.
// Next.js is used only for the API routes in pages/api/

export async function getServerSideProps(context) {
  return {
    redirect: { destination: '/index.html', permanent: false }
  }
}

export default function Home() { return null }
