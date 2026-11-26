package com.whitelabel.commerce.feature.catalog

import com.whitelabel.commerce.core.designsystem.components.BannerFeedback
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material.icons.outlined.StarOutline
import androidx.compose.material.icons.rounded.Edit
import androidx.compose.material.icons.rounded.Star
import androidx.compose.material.icons.rounded.Verified
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.key
import androidx.compose.runtime.saveable.rememberSaveable
import java.util.Locale
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.whitelabel.commerce.core.designsystem.LocalBrandColors
import com.whitelabel.commerce.core.designsystem.components.RatingAmberColor
import com.whitelabel.commerce.core.designsystem.components.RatingAmberTextColor
import com.whitelabel.commerce.core.designsystem.localized
import com.whitelabel.commerce.core.domain.model.ProductReview
import com.whitelabel.commerce.core.domain.model.RatingStats
import com.whitelabel.commerce.core.domain.model.ReviewEligibility
import com.whitelabel.commerce.core.domain.model.ReviewFormatting
import com.whitelabel.commerce.feature.orders.formatOrderDate

private val VerifiedEmeraldBg = Color(0xFFECFDF5)
private val VerifiedEmeraldText = Color(0xFF047857)

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ProductReviewsSection(
    reviews: List<ProductReview>,
    eligibility: ReviewEligibility,
    isSignedIn: Boolean,
    userId: String?,
    sendingFollowUp: Boolean,
    followUpFailed: Boolean,
    onFollowUp: (String, String) -> Unit,
    isSubmitting: Boolean,
    submitError: String?,
    onOpenWriteReview: () -> Unit,
    onOpenAccount: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val brandColors = LocalBrandColors.current
    val stats: RatingStats = remember(reviews) { ReviewFormatting.computeStats(reviews) }
    var selectedStarFilter by remember { mutableStateOf<Int?>(null) }

    val filteredReviews = remember(reviews, selectedStarFilter) {
        val published = reviews.filter { it.status == "published" }
        if (selectedStarFilter == null) published else published.filter { it.rating == selectedStarFilter }
    }

    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        // Section Header + Write/Edit CTA
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column {
                Text(
                    text = localized("آراء المشترين الموثّقين", "Verified Customer Feedback"),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.secondary,
                    fontWeight = FontWeight.Bold,
                )
                Text(
                    text = localized("تقييمات المنتج", "Customer Reviews"),
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                )
            }

            if (eligibility.eligible) {
                Button(
                    onClick = onOpenWriteReview,
                    enabled = !isSubmitting,
                    shape = CircleShape,
                ) {
                    Icon(
                        imageVector = Icons.Rounded.Edit,
                        contentDescription = null,
                        modifier = Modifier.size(15.dp),
                    )
                    Text(
                        text = if (eligibility.existingReview != null) {
                            localized("تعديل تقييمك", "Edit Review")
                        } else {
                            localized("أضف تقييمك", "Write Review")
                        },
                        style = MaterialTheme.typography.labelMedium,
                        modifier = Modifier.padding(start = 6.dp),
                    )
                }
            }
        }

        // Rating Summary Card with Distribution Bars
        Card(
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
            border = BorderStroke(1.dp, brandColors.hairline),
            shape = MaterialTheme.shapes.medium,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp),
                horizontalArrangement = Arrangement.spacedBy(16.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                // Big Score Block
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(4.dp),
                    modifier = Modifier.width(96.dp),
                ) {
                    Text(
                        text = if (stats.total > 0) stats.formattedAverage else "—",
                        style = MaterialTheme.typography.headlineLarge,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onSurface,
                    )
                    StarIndicatorRow(rating = stats.average.toInt().coerceIn(0, 5), size = 15)
                    Text(
                        text = if (stats.total > 0) {
                            localized("${stats.total} تقييم", "${stats.total} reviews")
                        } else {
                            localized("لا توجد تقييمات", "No reviews")
                        },
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }

                // 5★ -> 1★ Distribution Bars
                Column(
                    modifier = Modifier.weight(1f),
                    verticalArrangement = Arrangement.spacedBy(5.dp),
                ) {
                    stats.distribution.forEach { row ->
                        val isSelected = selectedStarFilter == row.stars
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(6.dp))
                                .background(
                                    if (isSelected) RatingAmberColor.copy(alpha = 0.14f) else Color.Transparent,
                                )
                                .clickable {
                                    selectedStarFilter = if (isSelected) null else row.stars
                                }
                                .padding(horizontal = 4.dp, vertical = 2.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                        ) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(2.dp),
                                modifier = Modifier.width(30.dp),
                            ) {
                                Text(
                                    text = "${row.stars}",
                                    style = MaterialTheme.typography.labelSmall,
                                    fontWeight = FontWeight.SemiBold,
                                )
                                Icon(
                                    imageVector = Icons.Rounded.Star,
                                    contentDescription = null,
                                    tint = RatingAmberColor,
                                    modifier = Modifier.size(11.dp),
                                )
                            }
                            LinearProgressIndicator(
                                progress = { row.fraction },
                                modifier = Modifier
                                    .weight(1f)
                                    .height(7.dp)
                                    .clip(CircleShape),
                                color = RatingAmberColor,
                                trackColor = MaterialTheme.colorScheme.surfaceVariant,
                                strokeCap = StrokeCap.Round,
                            )
                            Text(
                                text = "${row.count}",
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.width(20.dp),
                            )
                        }
                    }
                }
            }
        }

        // Calm Neutral Eligibility Note for Non-Buyers / Guests
        if (!eligibility.eligible) {
            Surface(
                color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.55f),
                shape = MaterialTheme.shapes.small,
                border = BorderStroke(1.dp, brandColors.hairline),
                modifier = Modifier.fillMaxWidth(),
            ) {
                Row(
                    modifier = Modifier.padding(12.dp),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(
                        imageVector = Icons.Outlined.Info,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.size(18.dp),
                    )
                    Text(
                        text = if (isSignedIn) {
                            localized(
                                "التقييمات مخصّصة حصرياً للعملاء الذين اشتروا هذا المنتج وتم تسليم طلبهم بنجاح.",
                                "Reviews are exclusive to verified customers with a delivered order for this product.",
                            )
                        } else {
                            localized(
                                "سجّل الدخول لتتمكن من إضافة تقييم موثّق بعد استلام طلبك.",
                                "Sign in to submit a verified review once your order is delivered.",
                            )
                        },
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.weight(1f),
                    )
                    if (!isSignedIn) {
                        OutlinedButton(
                            onClick = onOpenAccount,
                            shape = CircleShape,
                        ) {
                            Text(
                                text = localized("دخول", "Sign In"),
                                style = MaterialTheme.typography.labelSmall,
                            )
                        }
                    }
                }
            }
        }

        submitError?.let { BannerFeedback(it) }

        // Star Filter Chips
        if (stats.total > 0) {
            FlowRow(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                FilterChip(
                    selected = selectedStarFilter == null,
                    onClick = { selectedStarFilter = null },
                    label = { Text(localized("الكل (${stats.total})", "All (${stats.total})")) },
                    shape = CircleShape,
                    colors = FilterChipDefaults.filterChipColors(
                        selectedContainerColor = MaterialTheme.colorScheme.primary,
                        selectedLabelColor = MaterialTheme.colorScheme.onPrimary,
                    ),
                )
                stats.distribution.filter { it.count > 0 }.forEach { row ->
                    FilterChip(
                        selected = selectedStarFilter == row.stars,
                        onClick = {
                            selectedStarFilter = if (selectedStarFilter == row.stars) null else row.stars
                        },
                        label = { Text("${row.stars}★ (${row.count})") },
                        shape = CircleShape,
                        colors = FilterChipDefaults.filterChipColors(
                            selectedContainerColor = MaterialTheme.colorScheme.primary,
                            selectedLabelColor = MaterialTheme.colorScheme.onPrimary,
                        ),
                    )
                }
            }
        }

        // Individual Review Cards
        filteredReviews.forEach { review ->
            key(review.id) {
                ReviewItemCard(
                    review = review,
                    canReply = review.canFollowUp(eligibility.existingReview, userId),
                    sending = sendingFollowUp,
                    failed = followUpFailed,
                    onFollowUp = { onFollowUp(review.id, it) },
                )
            }
        }
    }
}

@Composable
private fun ReviewItemCard(
    review: ProductReview,
    canReply: Boolean,
    sending: Boolean,
    failed: Boolean,
    onFollowUp: (String) -> Unit,
) {
    val brandColors = LocalBrandColors.current
    Card(
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, brandColors.hairline),
        shape = MaterialTheme.shapes.medium,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(
            modifier = Modifier.padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Surface(
                    shape = CircleShape,
                    color = MaterialTheme.colorScheme.primaryContainer,
                    modifier = Modifier.size(38.dp),
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Text(
                            text = review.authorInitial,
                            style = MaterialTheme.typography.titleSmall,
                            color = MaterialTheme.colorScheme.primary,
                            fontWeight = FontWeight.Bold,
                        )
                    }
                }

                Column(
                    modifier = Modifier.weight(1f),
                    verticalArrangement = Arrangement.spacedBy(3.dp),
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        Text(
                            text = review.authorName,
                            style = MaterialTheme.typography.titleSmall,
                            fontWeight = FontWeight.SemiBold,
                        )
                        if (review.isVerifiedPurchase) {
                            Surface(
                                color = VerifiedEmeraldBg,
                                shape = CircleShape,
                            ) {
                                Row(
                                    modifier = Modifier.padding(horizontal = 7.dp, vertical = 2.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(3.dp),
                                ) {
                                    Icon(
                                        imageVector = Icons.Rounded.Verified,
                                        contentDescription = null,
                                        tint = VerifiedEmeraldText,
                                        modifier = Modifier.size(11.dp),
                                    )
                                    Text(
                                        text = localized("مشتري موثّق", "Verified"),
                                        style = MaterialTheme.typography.labelSmall,
                                        color = VerifiedEmeraldText,
                                        fontWeight = FontWeight.SemiBold,
                                    )
                                }
                            }
                        }
                    }

                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        StarIndicatorRow(rating = review.rating, size = 14)
                        if (review.createdAt.isNotBlank()) {
                            Text(
                                text = formatOrderDate(review.createdAt),
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                }
            }

            if (review.comment.isNotBlank()) {
                Text(
                    text = review.comment,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurface,
                )
            }

            if (!review.adminReply.isNullOrBlank()) {
                ReviewThread(review, canReply, sending, failed, onFollowUp)
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ReviewThread(
    review: ProductReview, canReply: Boolean, sending: Boolean, failed: Boolean, onFollowUp: (String) -> Unit,
) {
    var expanded by rememberSaveable(review.id) { mutableStateOf(false) }
    var editing by rememberSaveable(review.id, canReply) { mutableStateOf(false) }
    var body by rememberSaveable(review.id, canReply) { mutableStateOf("") }
    val turns = review.thread
    val locale = Locale.forLanguageTag(localized("ar-EG", "en-GB"))
    Column(
        modifier = Modifier.fillMaxWidth().padding(start = 10.dp)
            .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.32f), MaterialTheme.shapes.small)
            .padding(horizontal = 12.dp, vertical = 6.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        if (turns.size > 1) {
            TextButton(onClick = { expanded = !expanded }) {
                Text(if (expanded) localized("إخفاء الردود", "Hide replies")
                    else localized("عرض الردود (${turns.size})", "View replies (${turns.size})"))
            }
        }
        if (turns.size == 1 || expanded) {
            turns.forEach { turn ->
                val role = if (turn.role == "customer") localized("رد العميل", "Customer Follow-up") else localized("رد المتجر", "Store Reply")
                val date = ReviewFormatting.replyDate(turn.createdAt, locale)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    val roleColor = if (turn.role == "customer") MaterialTheme.colorScheme.onSurfaceVariant
                        else MaterialTheme.colorScheme.primary
                    Text(role, style = MaterialTheme.typography.labelMedium, color = roleColor,
                        modifier = Modifier.background(roleColor.copy(alpha = .08f), RoundedCornerShape(4.dp))
                            .padding(horizontal = 5.dp, vertical = 1.dp))
                    if (date.isNotEmpty()) Text(date, style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Text(turn.body, style = MaterialTheme.typography.bodySmall)
            }
        }
        if (canReply && !editing) {
            TextButton(onClick = { editing = true }) { Text(localized("الرد على المتجر", "Reply to store")) }
        }
        if (canReply && editing) {
            val count = ReviewFormatting.characterCount(body)
            OutlinedTextField(value = body, onValueChange = { body = it }, enabled = !sending,
                label = { Text(localized("رد العميل", "Customer Follow-up")) }, minLines = 2, maxLines = 5,
                isError = count > ReviewFormatting.FOLLOW_UP_LIMIT,
                supportingText = { Text("$count / ${ReviewFormatting.FOLLOW_UP_LIMIT}") },
                modifier = Modifier.fillMaxWidth())
            if (failed) Text(localized("تعذر حفظ الرد. حاول مرة أخرى.", "Couldn’t save your reply. Try again."),
                style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Button(onClick = { expanded = true; onFollowUp(body) },
                    enabled = !sending && ReviewFormatting.validFollowUp(body)) {
                    Text(if (sending) localized("جارٍ الحفظ…", "Saving…") else localized("حفظ الرد", "Save reply"))
                }
                TextButton(onClick = { editing = false; body = "" }, enabled = !sending) {
                    Text(localized("إلغاء", "Cancel"))
                }
            }
        }
    }
}

@Composable
private fun StarIndicatorRow(
    rating: Int,
    size: Int = 15,
) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(1.dp),
    ) {
        for (star in 1..5) {
            val filled = star <= rating
            Icon(
                imageVector = if (filled) Icons.Rounded.Star else Icons.Outlined.StarOutline,
                contentDescription = null,
                tint = if (filled) RatingAmberColor else MaterialTheme.colorScheme.outlineVariant,
                modifier = Modifier.size(size.dp),
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun WriteReviewBottomSheet(
    initialRating: Int,
    initialComment: String,
    isEditing: Boolean,
    isSubmitting: Boolean,
    onSubmit: (rating: Int, comment: String) -> Unit,
    onDismiss: () -> Unit,
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    var rating by remember(initialRating) { mutableIntStateOf(initialRating.coerceIn(1, 5)) }
    var comment by remember(initialComment) { mutableStateOf(initialComment) }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        containerColor = MaterialTheme.colorScheme.surface,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp)
                .padding(bottom = 28.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Text(
                text = if (isEditing) {
                    localized("تعديل تقييمك الموثّق", "Edit Your Verified Review")
                } else {
                    localized("شاركنا تجربتك مع المنتج", "Share Your Experience")
                },
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold,
            )

            // Large Tactile Stars (48dp tap targets) + Live Bilingual Label
            Column(
                modifier = Modifier.fillMaxWidth(),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Row(
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    for (star in 1..5) {
                        val filled = star <= rating
                        Surface(
                            onClick = { rating = star },
                            shape = RoundedCornerShape(12.dp),
                            color = if (filled) {
                                RatingAmberColor.copy(alpha = 0.14f)
                            } else {
                                MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)
                            },
                            modifier = Modifier.size(48.dp),
                        ) {
                            Box(contentAlignment = Alignment.Center) {
                                Icon(
                                    imageVector = if (filled) Icons.Rounded.Star else Icons.Outlined.StarOutline,
                                    contentDescription = "$star",
                                    tint = if (filled) RatingAmberColor else MaterialTheme.colorScheme.onSurfaceVariant,
                                    modifier = Modifier.size(28.dp),
                                )
                            }
                        }
                    }
                }

                Surface(
                    color = RatingAmberColor.copy(alpha = 0.14f),
                    shape = CircleShape,
                ) {
                    Text(
                        text = "$rating★ · ${ReviewFormatting.localizedRatingCaption(rating)}",
                        style = MaterialTheme.typography.labelLarge,
                        fontWeight = FontWeight.Bold,
                        color = RatingAmberTextColor,
                        modifier = Modifier.padding(horizontal = 14.dp, vertical = 5.dp),
                    )
                }
            }

            OutlinedTextField(
                value = comment,
                onValueChange = { if (it.length <= 1500) comment = it },
                minLines = 3,
                maxLines = 5,
                label = {
                    Text(
                        localized(
                            "اكتب رأيك في المنتج (اختياري)",
                            "Write your review (optional)",
                        ),
                    )
                },
                supportingText = {
                    Text("${comment.length} / 1500")
                },
                shape = MaterialTheme.shapes.small,
                modifier = Modifier.fillMaxWidth(),
            )

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                OutlinedButton(
                    onClick = onDismiss,
                    enabled = !isSubmitting,
                    shape = MaterialTheme.shapes.small,
                    modifier = Modifier.weight(1f),
                ) {
                    Text(localized("إلغاء", "Cancel"))
                }
                Button(
                    onClick = { onSubmit(rating, comment) },
                    enabled = !isSubmitting,
                    shape = MaterialTheme.shapes.small,
                    modifier = Modifier.weight(1.4f),
                ) {
                    if (isSubmitting) {
                        CircularProgressIndicator(
                            strokeWidth = 2.dp,
                            color = MaterialTheme.colorScheme.onPrimary,
                            modifier = Modifier.size(18.dp),
                        )
                    } else {
                        Text(
                            if (isEditing) {
                                localized("حفظ التعديل", "Save Changes")
                            } else {
                                localized("نشر التقييم", "Publish Review")
                            },
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(4.dp))
        }
    }
}
