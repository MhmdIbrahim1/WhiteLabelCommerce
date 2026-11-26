package com.whitelabel.commerce.feature.catalog

import com.whitelabel.commerce.core.domain.model.Category
import com.whitelabel.commerce.core.domain.model.Product
import com.whitelabel.commerce.core.domain.search.LocalCatalogSearch
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.Parameterized

private fun item(id: String, ar: String, en: String, description: String = "") =
    Product(id = id, name = ar, nameEn = en, description = description, categoryId = id,
        price = 999.0, stock = 2)

private val inventory = listOf(
    item("watch", "ساعة جلد أسود", "Watch"), item("bag", "حقيبة جلد", "Bag", "سعة كبيرة"),
    item("wallet", "محفظة", "Wallet", "سعة إضافية"), item("shoes", "حذاء رياضي", "Running Shoes"),
    item("glasses", "نظارة", "Sunglasses"), item("tee", "تيشيرت", "Cotton T-Shirt"),
    item("pants", "بنطلون", "Trousers"), item("hoodie", "هودي", "Hoodie"), item("audio", "سماعة", "Earbuds"),
)

@RunWith(Parameterized::class)
class LocalQueryTest(private val query: String, private val id: String, private val reason: String?) {
    companion object {
        @JvmStatic @Parameterized.Parameters(name = "{0} -> {1}")
        fun queries() = listOf(
            arrayOf("سعه", "watch", "spell"), arrayOf("سعاة", "watch", "spell"),
            arrayOf("shum", "watch", "layout"), arrayOf("shui", "watch", "layout"),
            arrayOf("sa3a", "watch", "franco"), arrayOf("نضاره", "glasses", null),
            arrayOf("شنطه", "bag", null), arrayOf("جزمه", "shoes", null),
            arrayOf("كوتشي", "shoes", null), arrayOf("gazma", "shoes", "franco"),
            arrayOf("تشيرت", "tee", null), arrayOf("بنطلن", "pants", "spell"),
            arrayOf("سعه جلد", "watch", "spell"), arrayOf("سعه جلد اسود", "watch", "spell"),
            arrayOf("hoddie", "hoodie", "spell"), arrayOf("sunglases", "glasses", "spell"),
            arrayOf("awtch", "watch", "spell"), arrayOf("k/hvm", "glasses", "layout"),
            arrayOf("jdadvj", "tee", "layout"), arrayOf("samma3a", "audio", "franco"),
            arrayOf("السَّاعَـة تحت ١٠٠٠", "watch", null), arrayOf("t-shirts", "tee", null),
        )
    }

    @Test fun ranksExpectedProductAndReportsOriginalQuery() {
        val result = LocalCatalogSearch.search(inventory, emptyList(), query)
        assertEquals(id, result.products.firstOrNull()?.id)
        assertEquals(reason, result.correction?.reason)
        if (reason != null) assertEquals(query, result.correction?.original)
    }
}

class LocalCatalogSearchTest {
    @Test fun exactOptOutKeepsOnlyLiteralCapacityDescriptions() {
        val result = LocalCatalogSearch.search(inventory, emptyList(), "سعه", exact = true)
        assertNull(result.correction)
        assertEquals(setOf("bag", "wallet"), result.products.map { it.id }.toSet())
        assertTrue(LocalCatalogSearch.search(inventory, emptyList(), "shum", exact = true).products.isEmpty())
    }

    @Test fun strongLiteralBlocksSpellCorrectionAndInactiveProductsDoNotTeachVocabulary() {
        val actual = inventory + item("literal", "سعة", "Capacity")
        val result = LocalCatalogSearch.search(actual, emptyList(), "سعه")
        assertNull(result.correction)
        assertEquals("literal", result.products.first().id)
        val inactive = inventory.filter { it.id in setOf("bag", "watch") }.map { it.copy(isActive = it.id != "watch") }
        assertNull(LocalCatalogSearch.search(inactive, emptyList(), "سعه").correction)
    }

    @Test fun transpositionsAndLongVowels() {
        assertEquals(1, LocalCatalogSearch.distance("سعاة", "ساعة", 1))
        assertEquals(1, LocalCatalogSearch.distance("awtch", "watch", 1))
        assertEquals(2, LocalCatalogSearch.distance("ca", "abc", 2))
        assertEquals("سع", LocalCatalogSearch.skeleton("سعه"))
        assertEquals("سع", LocalCatalogSearch.skeleton("ساعة"))
        assertEquals("بنطلن", LocalCatalogSearch.skeleton("بنطلون"))
        assertEquals("هدي", LocalCatalogSearch.skeleton("هودي"))
        assertEquals("shum", LocalCatalogSearch.convertLayout("ساعة"))
    }

    @Test fun titleCategoryAndDescriptionKeepTheirOrderWithBusinessSignals() {
        val title = item("title", "نظارة", "Eyewear").copy(stock = 0)
        val category = item("cat", "طيار", "Aviator")
        val body = item("body", "حقيبة", "Bag", "نظارة").copy(reviewCount = 500)
        val categories = listOf(Category("cat", "sun", name = "نظارات"))
        val result = LocalCatalogSearch.search(listOf(body, category, title), categories, "نظارة")
        assertEquals(listOf("title", "cat", "body"), result.products.map { it.id })
    }

    @Test fun softMatchRequiresTwoOfThreeAndPriceIntentKeepsWords() {
        val result = LocalCatalogSearch.search(inventory, emptyList(), "ساعة جلد xyzzy")
        assertEquals(listOf("watch"), result.products.map { it.id })
        assertTrue(LocalCatalogSearch.search(inventory, emptyList(), "watch under 999").products.isEmpty())
        assertTrue(LocalCatalogSearch.search(inventory, emptyList(), "watch under 1000").products.isNotEmpty())
    }
}
