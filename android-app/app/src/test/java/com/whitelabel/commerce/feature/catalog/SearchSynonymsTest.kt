package com.whitelabel.commerce.feature.catalog

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class SearchSynonymsTest {

    @Test
    fun `resolves direct and fuzzy Arabic and English synonym hints`() {
        val kochi = SearchSynonyms.getInstantHints("كوتشي")
        assertTrue(kochi.any { it.tag == "footwear" })

        val tshirtSkeleton = SearchSynonyms.getInstantHints("تشرت")
        assertTrue(tshirtSkeleton.any { it.tag == "tops_shirts" })

        val sneakersTypo = SearchSynonyms.getInstantHints("sneekers")
        assertTrue(sneakersTypo.any { it.tag == "footwear" })

        val jacketTypo = SearchSynonyms.getInstantHints("jaket")
        assertTrue(jacketTypo.any { it.tag == "outerwear_winter" })
    }

    @Test
    fun `detects correct size guide tab from product sizes`() {
        assertEquals(SizeGuideTab.APPAREL, detectSizeGuideTab(listOf("S", "M", "L", "XL")))
        assertEquals(SizeGuideTab.PANTS, detectSizeGuideTab(listOf("30", "32", "34", "36")))
        assertEquals(SizeGuideTab.SHOES, detectSizeGuideTab(listOf("41", "42", "43", "44")))
    }
}
