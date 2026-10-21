import { Apple, Beef, Carrot, Coffee, Egg, Fish, Flower2, Palette, Shirt, ShoppingBasket, SprayCan, Sprout, Wheat, type LucideIcon } from 'lucide-react'

const CATEGORY_ICON_RULES: Array<[RegExp, LucideIcon, string]> = [
  [/carne|pollo|cerdo|res\b/i, Beef, 'meat'],
  [/pescad|marisc/i, Fish, 'fish'],
  [/productos artesanal|miel|dulce|conserva/i, Flower2, 'honey'],
  [/frut|verdur|aliment|fresc/i, Carrot, 'fresh'],
  [/artesan|canast|tejid/i, ShoppingBasket, 'craft'],
  [/planta|vivero|flor/i, Sprout, 'plants'],
  [/ropa|accesorio|textil/i, Shirt, 'clothes'],
  [/hogar|limpieza|jab/i, SprayCan, 'home'],
  [/huevo|l[aá]cteo|queso/i, Egg, 'dairy'],
  [/caf[eé]|bebida|cacao/i, Coffee, 'coffee'],
  [/campo|grano|arroz/i, Wheat, 'field'],
  [/arte|pintur/i, Palette, 'art'],
]

/** Icono y tono visual de una categoría, deducidos de su nombre. */
export function categoryVisual(name: string): { Icon: LucideIcon; tone: string } {
  const match = CATEGORY_ICON_RULES.find(([pattern]) => pattern.test(name))
  return match ? { Icon: match[1], tone: match[2] } : { Icon: Apple, tone: 'other' }
}

/**
 * Fotos opcionales por categoría (slug → URL importada).
 * Agrega aquí las fotografías reales cuando estén disponibles, por ejemplo:
 *   import mielPhoto from '../../assets/categories/miel.webp'
 *   'miel': mielPhoto,
 * Mientras una categoría no tenga foto se muestra su ilustración con icono.
 */
export const CATEGORY_PHOTOS: Record<string, string> = {}
