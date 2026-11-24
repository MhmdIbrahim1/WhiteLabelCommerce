package com.whitelabel.commerce.core.designsystem.components

import android.net.Uri
import com.whitelabel.commerce.core.designsystem.localized

/**
 * Mirrors `web-store/src/lib/shipping.ts` so Bosta/Aramex/Mylerz/Egypt Post carrier names
 * are 100% localized in both Arabic and English and can open direct public tracking URLs.
 */
object CarrierLocalizer {

    fun displayCarrier(raw: String?): String? {
        val clean = raw?.trim().orEmpty()
        if (clean.isEmpty()) return null
        val lower = clean.lowercase()
        return when {
            "bosta" in lower || "بوسطة" in clean -> localized("بوسطة", "Bosta")
            "aramex" in lower || "أرامكس" in clean || "ارامكس" in clean -> localized("أرامكس", "Aramex")
            "mylerz" in lower || "مايلرز" in clean -> localized("مايلرز", "Mylerz")
            "egypt" in lower || "البريد" in clean -> localized("البريد المصري", "Egypt Post")
            "private" in lower || "مندوب" in clean -> localized("مندوب خاص", "Private Courier")
            else -> clean
        }
    }

    fun buildTrackingUrl(carrier: String?, trackingNumber: String?): String? {
        val num = trackingNumber?.trim().orEmpty()
        val rawCarrier = carrier?.trim().orEmpty()
        if (num.isEmpty() || rawCarrier.isEmpty()) return null
        val encoded = Uri.encode(num)
        val lower = rawCarrier.lowercase()
        return when {
            "bosta" in lower || "بوسطة" in rawCarrier ->
                "https://bosta.co/en-eg/tracking-shipments?shipment-number=$encoded"
            "aramex" in lower || "أرامكس" in rawCarrier || "ارامكس" in rawCarrier ->
                "https://www.aramex.com/eg/ar/track/results?ShipmentNumber=$encoded"
            "mylerz" in lower || "مايلرز" in rawCarrier ->
                "https://mylerz.net/track/$encoded"
            "egypt" in lower || "البريد" in rawCarrier ->
                "https://egyptpost.gov.eg/ar-eg/home/eservices/track-and-trace/?id=$encoded"
            else -> null
        }
    }
}
