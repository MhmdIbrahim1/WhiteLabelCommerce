package com.whitelabel.commerce.core.domain.model

import com.whitelabel.commerce.core.designsystem.localized

enum class ReturnRequestType(val rawValue: String) {
    RETURN("return"),
    EXCHANGE("exchange");

    val label: String
        get() = when (this) {
            RETURN -> localized("إرجاع", "Return")
            EXCHANGE -> localized("استبدال", "Exchange")
        }

    companion object {
        fun fromRaw(value: String?): ReturnRequestType =
            entries.firstOrNull { it.rawValue.equals(value?.trim(), ignoreCase = true) } ?: RETURN
    }
}

enum class ReturnRequestStatus(val rawValue: String) {
    PENDING("pending"),
    APPROVED("approved"),
    REJECTED("rejected"),
    RECEIVED("received"),
    REFUNDED("refunded");

    val label: String
        get() = when (this) {
            PENDING -> localized("قيد المراجعة", "Pending Review")
            APPROVED -> localized("مقبول", "Approved")
            REJECTED -> localized("مرفوض", "Rejected")
            RECEIVED -> localized("تم استلام المرتجع", "Item Received")
            REFUNDED -> localized("تم الاسترداد", "Refunded")
        }

    val isActive: Boolean
        get() = this != REJECTED

    companion object {
        fun fromRaw(value: String?): ReturnRequestStatus =
            entries.firstOrNull { it.rawValue.equals(value?.trim(), ignoreCase = true) } ?: PENDING
    }
}

enum class ReturnRefundMethod(val rawValue: String) {
    WALLET("wallet"),
    ORIGINAL_PAYMENT("original_payment");

    val label: String
        get() = when (this) {
            WALLET -> localized("محفظة المتجر (فوري)", "Store Wallet (Instant)")
            ORIGINAL_PAYMENT -> localized("وسيلة الدفع الأصلية", "Original Payment")
        }

    companion object {
        fun fromRaw(value: String?): ReturnRefundMethod =
            entries.firstOrNull { it.rawValue.equals(value?.trim(), ignoreCase = true) } ?: WALLET
    }
}

data class ReturnReasonOption(
    val code: String,
    val labelAr: String,
    val labelEn: String,
) {
    val label: String
        get() = localized(labelAr, labelEn)
}

object ReturnReasons {
    val presets: List<ReturnReasonOption> = listOf(
        ReturnReasonOption("wrong_size", "المقاس غير مناسب", "Wrong size or fit"),
        ReturnReasonOption("damaged", "المنتج تالف أو به عيب صناعة", "Item arrived damaged or defective"),
        ReturnReasonOption("wrong_item", "استلمت منتجاً مختلفاً عن طلبي", "Received wrong item"),
        ReturnReasonOption("not_as_described", "المنتج لا يطابق الوصف أو الصور", "Item does not match description"),
        ReturnReasonOption("changed_mind", "لم أعد بحاجة إلى المنتج", "Changed my mind"),
        ReturnReasonOption("other", "سبب آخر", "Other reason"),
    )

    fun localize(rawReason: String): String {
        val clean = rawReason.trim()
        val match = presets.firstOrNull {
            it.code.equals(clean, ignoreCase = true) ||
                it.labelAr == clean ||
                it.labelEn.equals(clean, ignoreCase = true)
        }
        return match?.label ?: clean
    }
}

data class ReturnRequestItem(
    val orderItemId: String? = null,
    val productId: String? = null,
    val productName: String = "",
    val quantity: Int = 1,
    val unitPrice: Double = 0.0,
    val lineTotal: Double = unitPrice * quantity,
    val size: String? = null,
    val color: String? = null,
)

data class ReturnSubmissionItem(
    val orderItemId: String,
    val quantity: Int,
)

data class ReturnRequest(
    val id: String,
    val storeId: String,
    val orderId: String,
    val userId: String,
    val requestType: ReturnRequestType = ReturnRequestType.RETURN,
    val status: ReturnRequestStatus = ReturnRequestStatus.PENDING,
    val refundMethod: ReturnRefundMethod = ReturnRefundMethod.WALLET,
    val reason: String = "",
    val customerNotes: String? = null,
    val adminNotes: String? = null,
    val refundAmount: Double = 0.0,
    val items: List<ReturnRequestItem> = emptyList(),
    val restocked: Boolean = false,
    val walletCredited: Boolean = false,
    val createdAt: String = "",
    val updatedAt: String = "",
) {
    val isActive: Boolean
        get() = status.isActive
}
