// Minimal app wrapper — UI is served as static HTML from /public/index.html
export default function App({ Component, pageProps }) {
  return <Component {...pageProps} />
}
