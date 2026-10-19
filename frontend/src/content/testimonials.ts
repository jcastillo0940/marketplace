export type Testimonial = {
  quote: string
  name: string
  role: string
  /** Foto opcional (importada desde src/assets). Sin foto se muestran las iniciales. */
  photo?: string
}

/**
 * Testimonios reales de productores, con su autorización.
 * La sección "Historias" del inicio solo se muestra cuando esta lista tiene elementos.
 * En desarrollo local se muestra un ejemplo marcado como tal para revisar el diseño.
 *
 * Ejemplo:
 *   { quote: 'Gracias a El Empujoncito he podido llegar a más personas.', name: 'Nombre Apellido', role: 'Productora de plantas, Coclé' },
 */
export const TESTIMONIALS: Testimonial[] = []

export const TESTIMONIAL_DESIGN_SAMPLE: Testimonial[] = [
  { quote: 'Gracias a El Empujoncito he podido llegar a más personas y seguir creciendo.', name: 'Ejemplo de testimonio', role: 'Reemplazar por un testimonio real autorizado' },
  { quote: 'Ahora mis clientes me escriben directo por WhatsApp para pedir mis productos.', name: 'Ejemplo de testimonio', role: 'Reemplazar por un testimonio real autorizado' },
]
