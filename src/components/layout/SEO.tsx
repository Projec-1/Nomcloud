import { useEffect } from 'react'

interface SEOProps {
  title: string
  description: string
  path?: string
  siteName?: string
}

const SITE_NAME = 'Nom Cloud'
const SITE_URL = 'https://www.nomcloud.academy'

function setMeta(attr: 'name' | 'property', key: string, content: string) {
  let el = document.querySelector(`meta[${attr}="${key}"]`)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, key)
    document.head.appendChild(el)
  }
  el.setAttribute('content', content)
}

function setLink(rel: string, href: string) {
  let el = document.querySelector(`link[rel="${rel}"]`)
  if (!el) {
    el = document.createElement('link')
    el.setAttribute('rel', rel)
    document.head.appendChild(el)
  }
  el.setAttribute('href', href)
}

/**
 * Lightweight, dependency-free per-page SEO manager. Sets the document title,
 * meta description, canonical URL, and Open Graph / Twitter card tags on mount.
 * No external library needed (react-helmet et al. aren't installable in this
 * offline build), so this just talks to document.head directly.
 */
export default function SEO({ title, description, path = '', siteName = SITE_NAME }: SEOProps) {
  useEffect(() => {
    const fullTitle = title.includes(siteName) ? title : `${title} — ${siteName}`
    document.title = fullTitle
    setMeta('name', 'description', description)
    setLink('canonical', `${SITE_URL}${path}`)

    setMeta('property', 'og:title', fullTitle)
    setMeta('property', 'og:description', description)
    setMeta('property', 'og:type', 'website')
    setMeta('property', 'og:url', `${SITE_URL}${path}`)
    setMeta('property', 'og:image', `${SITE_URL}/logo-512.png`)
    setMeta('property', 'og:site_name', siteName)

    setMeta('name', 'twitter:card', 'summary_large_image')
    setMeta('name', 'twitter:title', fullTitle)
    setMeta('name', 'twitter:description', description)
    setMeta('name', 'twitter:image', `${SITE_URL}/logo-512.png`)
  }, [title, description, path, siteName])

  return null
}
