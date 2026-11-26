package com.whitelabel.commerce.feature.orders

import com.whitelabel.commerce.core.domain.model.formatOrderNumber
import android.content.Context
import android.print.PrintManager
import android.text.TextUtils.htmlEncode
import android.webkit.WebView
import android.webkit.WebViewClient
import com.whitelabel.commerce.core.designsystem.formatPrice
import com.whitelabel.commerce.core.designsystem.localized
import com.whitelabel.commerce.core.domain.model.Order

internal fun printOrderInvoice(context: Context, order: Order, locale: String) {
    val title = localized("فاتورة", "Invoice") + " " + formatOrderNumber(order.id)
    val rows = order.items.joinToString("") {
        "<tr><td>${htmlEncode(it.productName)}</td><td>${it.quantity}</td><td>${htmlEncode(formatPrice(it.lineTotal, order.currency, locale))}</td></tr>"
    }
    val view = WebView(context)
    view.webViewClient = object : WebViewClient() {
        override fun onPageFinished(page: WebView, url: String) {
            val manager = context.getSystemService(Context.PRINT_SERVICE) as PrintManager
            manager.print(title, page.createPrintDocumentAdapter(title), null)
        }
    }
    val dir = localized("rtl", "ltr")
    val total = formatPrice(order.total ?: 0.0, order.currency, locale)
    val shipping = formatPrice(order.shippingFee, order.currency, locale)
    val payment = htmlEncode(order.paymentMethod?.rawValue.orEmpty())
    view.loadDataWithBaseURL(null, """<html dir="$dir"><meta charset="utf-8"><style>body{font:16px sans-serif;margin:32px}td{padding:8px}</style>
        <h1>${htmlEncode(title)}</h1><p>${htmlEncode(order.shippingAddress)}</p><p>${htmlEncode(order.createdAt.take(10))} · $payment</p>
        <table>$rows</table><p>${localized("التوصيل","Shipping")}: $shipping</p><strong>${localized("الإجمالي","Total")}: $total</strong></html>""",
        "text/html", "UTF-8", null)
}
