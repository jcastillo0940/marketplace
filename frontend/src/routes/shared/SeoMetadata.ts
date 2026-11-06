import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const DEFAULT_TITLE = 'MercaPRO — Marketplace de Productores Locales en Panamá'
const DEFAULT_DESCRIPTION = 'Compra directo a productores y vendedores locales de Panamá. Carnes, frutas, agroalimentos, artesanías y más. Contacta directamente.'

function setMeta(selector: string, attribute: string, value: string) {
  let element = document.head.querySelector<HTMLMetaElement>(selector)
  if (!element) {
    element = document.createElement('meta')
    if (selector.startsWith('meta[property=')) element.setAttribute('property', selector.match(/\[property="([^"]+)"\]/)?.[1] ?? '')
    else element.name = selector.match(/\[name="([^"]+)"\]/)?.[1] ?? ''
    document.head.appendChild(element)
  }
  element.setAttribute(attribute, value)
}

function injectJsonLd(data: object | object[]) {
  let tag = document.head.querySelector<HTMLScriptElement>('script#ld-json')
  if (!tag) {
    tag = document.createElement('script')
    tag.id = 'ld-json'
    tag.type = 'application/ld+json'
    document.head.appendChild(tag)
  }
  tag.textContent = JSON.stringify(data)
}

function removeJsonLd() {
  document.head.querySelector('script#ld-json')?.remove()
}

export function useSeoMetadata(
  title: string,
  description: string,
  image?: string,
  type: 'website' | 'product' | 'profile' = 'website',
  jsonLd?: object | object[],
) {
  const location = useLocation()
  useEffect(() => {
    const canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')
      ?? document.head.appendChild(Object.assign(document.createElement('link'), { rel: 'canonical' }))
    const canonicalUrl = `${window.location.origin}${location.pathname}`

    document.title = title
    setMeta('meta[name="description"]', 'content', description)
    setMeta('meta[property="og:title"]', 'content', title)
    setMeta('meta[property="og:description"]', 'content', description)
    setMeta('meta[property="og:type"]', 'content', type === 'profile' ? 'profile' : type)
    setMeta('meta[property="og:url"]', 'content', canonicalUrl)
    setMeta('meta[name="twitter:title"]', 'content', title)
    setMeta('meta[name="twitter:description"]', 'content', description)
    if (image) {
      setMeta('meta[property="og:image"]', 'content', image)
      setMeta('meta[name="twitter:image"]', 'content', image)
    } else {
      document.head.querySelector('meta[property="og:image"]')?.remove()
      document.head.querySelector('meta[name="twitter:image"]')?.remove()
    }
    canonical.href = canonicalUrl
    if (jsonLd) injectJsonLd(jsonLd)
    else removeJsonLd()

    return () => {
      document.title = DEFAULT_TITLE
      document.head.querySelector('meta[name="description"]')?.setAttribute('content', DEFAULT_DESCRIPTION)
      document.head.querySelector('meta[property="og:title"]')?.setAttribute('content', DEFAULT_TITLE)
      document.head.querySelector('meta[property="og:description"]')?.setAttribute('content', DEFAULT_DESCRIPTION)
      document.head.querySelector('meta[property="og:type"]')?.setAttribute('content', 'website')
      document.head.querySelector('meta[property="og:url"]')?.setAttribute('content', `${window.location.origin}/`)
      document.head.querySelector('meta[name="twitter:title"]')?.setAttribute('content', DEFAULT_TITLE)
      document.head.querySelector('meta[name="twitter:description"]')?.setAttribute('content', DEFAULT_DESCRIPTION)
      document.head.querySelector('meta[property="og:image"]')?.remove()
      document.head.querySelector('meta[name="twitter:image"]')?.remove()
      canonical.href = `${window.location.origin}/`
      removeJsonLd()
    }
  }, [description, image, location.pathname, title, type, jsonLd])
}
