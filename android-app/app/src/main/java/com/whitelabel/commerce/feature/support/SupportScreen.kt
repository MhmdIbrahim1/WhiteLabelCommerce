package com.whitelabel.commerce.feature.support

import com.whitelabel.commerce.core.domain.model.formatOrderNumber
import com.whitelabel.commerce.core.designsystem.components.BannerFeedback
import com.whitelabel.commerce.core.designsystem.localized

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.automirrored.rounded.Chat
import androidx.compose.material.icons.automirrored.rounded.Send
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.Email
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import com.whitelabel.commerce.core.designsystem.components.SearchAction
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.whitelabel.commerce.core.data.remote.PhoneNormalizer
import com.whitelabel.commerce.core.designsystem.LocalBrandColors
import com.whitelabel.commerce.core.designsystem.components.TicketStatusBadge
import com.whitelabel.commerce.core.domain.model.SupportTicket

private val WhatsAppGreen = Color(0xFF16A34A)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SupportScreen(
    onBack: () -> Unit,
    onSearch: () -> Unit,
    onOpenTicket: (String) -> Unit,
    onShowMessage: (String) -> Unit,
    modifier: Modifier = Modifier,
    viewModel: SupportViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val brandColors = LocalBrandColors.current
    val context = LocalContext.current
    val whatsAppDigits = PhoneNormalizer.formatWhatsAppDigits(state.storeSettings.whatsappNumber)

    Scaffold(
        modifier = modifier.fillMaxSize(),
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = localized("الدعم الفني والتواصل", "Help and contact"),
                        style = MaterialTheme.typography.titleLarge,
                    )
                },
                actions = { SearchAction(onSearch) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Rounded.ArrowBack,
                            contentDescription = localized("رجوع", "Back"),
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surface,
                    titleContentColor = MaterialTheme.colorScheme.onSurface,
                ),
            )
        },
    ) { innerPadding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            // 1. Quick WhatsApp & Email Contact Card
            if (whatsAppDigits.length >= 8 || state.storeSettings.supportEmail.isNotBlank()) {
                item {
                    Card(
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                        border = BorderStroke(1.dp, brandColors.hairline),
                        shape = MaterialTheme.shapes.medium,
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Column(
                            modifier = Modifier.padding(16.dp),
                            verticalArrangement = Arrangement.spacedBy(10.dp),
                        ) {
                            Text(
                                text = localized("تواصل مباشر مع ${state.storeSettings.storeName}", "Contact ${state.storeSettings.storeName}"),
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.Bold,
                            )

                            if (whatsAppDigits.length >= 8) {
                                Button(
                                    onClick = {
                                        val prefilledText = Uri.encode(
                                            localized("مرحباً فريق ${state.storeSettings.storeName}، أحتاج مساعدة.", "Hello ${state.storeSettings.storeName}, I need help."),
                                        )
                                        val intent = Intent(
                                            Intent.ACTION_VIEW,
                                            Uri.parse("https://wa.me/$whatsAppDigits?text=$prefilledText"),
                                        )
                                        runCatching { context.startActivity(intent) }
                                            .onFailure {
                                                onShowMessage(localized("تعذر فتح تطبيق واتساب على هذا الجهاز", "Unable to open WhatsApp on this device"))
                                            }
                                    },
                                    shape = MaterialTheme.shapes.small,
                                    colors = ButtonDefaults.buttonColors(
                                        containerColor = WhatsAppGreen,
                                        contentColor = Color.White,
                                    ),
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .height(46.dp),
                                ) {
                                    Icon(
                                        imageVector = Icons.AutoMirrored.Rounded.Chat,
                                        contentDescription = null,
                                        modifier = Modifier.size(18.dp),
                                    )
                                    Text(
                                        text = localized("محادثة فورية عبر واتساب", "Chat on WhatsApp"),
                                        style = MaterialTheme.typography.labelLarge,
                                        modifier = Modifier.padding(start = 8.dp),
                                    )
                                }
                            }

                            if (state.storeSettings.supportEmail.isNotBlank()) {
                                OutlinedButton(
                                    onClick = {
                                        val intent = Intent(
                                            Intent.ACTION_SENDTO,
                                            Uri.parse("mailto:${state.storeSettings.supportEmail}"),
                                        )
                                        runCatching { context.startActivity(intent) }
                                            .onFailure {
                                                onShowMessage(state.storeSettings.supportEmail)
                                            }
                                    },
                                    shape = MaterialTheme.shapes.small,
                                    modifier = Modifier.fillMaxWidth(),
                                ) {
                                    Icon(
                                        imageVector = Icons.Rounded.Email,
                                        contentDescription = null,
                                        modifier = Modifier.size(18.dp),
                                    )
                                    Text(
                                        text = state.storeSettings.supportEmail,
                                        modifier = Modifier.padding(start = 8.dp),
                                    )
                                }
                            }
                        }
                    }
                }
            }

            // 2. Submit Support Ticket Form
            item {
                Card(
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                    border = BorderStroke(1.dp, brandColors.hairline),
                    shape = MaterialTheme.shapes.medium,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Column(
                        modifier = Modifier.padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        Text(
                            text = localized("إرسال تذكرة دعم فني", "Send a support ticket"),
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                        )

                        OutlinedTextField(
                            value = state.form.subject,
                            onValueChange = viewModel::onSubjectChange,
                            label = { Text(localized("عنوان الموضوع", "Subject")) },
                            placeholder = { Text(localized("مثال: استفسار عن موعد التوصيل", "E.g. Delivery date inquiry")) },
                            isError = state.form.subjectError != null,
                            supportingText = state.form.subjectError?.let { { Text(it) } },
                            singleLine = true,
                            shape = MaterialTheme.shapes.small,
                            modifier = Modifier.fillMaxWidth(),
                        )

                        OutlinedTextField(
                            value = state.form.linkedOrderId,
                            onValueChange = viewModel::onLinkedOrderIdChange,
                            label = { Text(localized("رقم الطلب (اختياري)", "Order number (optional)")) },
                            placeholder = { Text(localized("اربط التذكرة برقم طلب سابق إن وجد", "Link a previous order")) },
                            singleLine = true,
                            shape = MaterialTheme.shapes.small,
                            modifier = Modifier.fillMaxWidth(),
                        )

                        // Quick-pick recent orders from DataStore
                        if (state.recentOrders.isNotEmpty()) {
                            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                Text(
                                    text = localized("اختر من طلباتك الأخيرة:", "Choose a recent order"),
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                                LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    items(state.recentOrders.take(5), key = { it.orderNumber }) { receipt ->
                                        val isPicked = state.form.linkedOrderId == receipt.orderNumber
                                        FilterChip(
                                            selected = isPicked,
                                            onClick = {
                                                viewModel.onLinkedOrderIdChange(
                                                    if (isPicked) "" else receipt.orderNumber,
                                                )
                                            },
                                            label = { Text(formatOrderNumber(receipt.orderNumber)) },
                                            shape = MaterialTheme.shapes.small,
                                        )
                                    }
                                }
                            }
                        }

                        OutlinedTextField(
                            value = state.form.message,
                            onValueChange = viewModel::onMessageChange,
                            label = { Text(localized("تفاصيل رسالتك", "Your message")) },
                            placeholder = { Text(localized("اكتب استفسارك أو مشكلتك بالتفصيل وسنرد عليك في أقرب وقت...", "Describe your question or issue…")) },
                            isError = state.form.messageError != null,
                            supportingText = state.form.messageError?.let { { Text(it) } },
                            minLines = 4,
                            maxLines = 6,
                            shape = MaterialTheme.shapes.small,
                            modifier = Modifier.fillMaxWidth(),
                        )

                        state.form.submitError?.let { BannerFeedback(it) }

                        if (state.form.submitSuccess) {
                            Surface(
                                color = brandColors.success.copy(alpha = 0.14f),
                                contentColor = brandColors.success,
                                shape = MaterialTheme.shapes.small,
                                modifier = Modifier.fillMaxWidth(),
                            ) {
                                Row(
                                    modifier = Modifier.padding(12.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                                ) {
                                    Icon(
                                        imageVector = Icons.Rounded.CheckCircle,
                                        contentDescription = null,
                                        modifier = Modifier.size(18.dp),
                                    )
                                    Text(
                                        text = localized("تم إرسال تذكرتك بنجاح! سيتواصل معك فريق الدعم قريباً.", "Ticket submitted. Support will contact you soon."),
                                        style = MaterialTheme.typography.bodySmall,
                                        fontWeight = FontWeight.SemiBold,
                                    )
                                }
                            }
                        }

                        Button(
                            onClick = viewModel::submitTicket,
                            enabled = !state.form.isSubmitting,
                            shape = MaterialTheme.shapes.small,
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(48.dp),
                        ) {
                            if (state.form.isSubmitting) {
                                CircularProgressIndicator(
                                    strokeWidth = 2.dp,
                                    color = MaterialTheme.colorScheme.onPrimary,
                                    modifier = Modifier.size(18.dp),
                                )
                            } else {
                                Icon(
                                    imageVector = Icons.AutoMirrored.Rounded.Send,
                                    contentDescription = null,
                                    modifier = Modifier.size(18.dp),
                                )
                                Text(
                                    text = localized("إرسال التذكرة", "Send ticket"),
                                    style = MaterialTheme.typography.labelLarge,
                                    modifier = Modifier.padding(start = 8.dp),
                                )
                            }
                        }
                    }
                }
            }

            if (state.form.ticketLoadFailed) {
                item {
                    Text(localized("تعذر تحديث التذاكر.", "Tickets could not be refreshed."))
                    OutlinedButton(onClick = viewModel::refreshTickets) { Text(localized("إعادة المحاولة", "Retry")) }
                }
            }

            if (state.allTickets.isNotEmpty()) {
                item {
                    Text(
                        text = localized("تذاكر الدعم والردود (${state.allTickets.size})", "Support tickets and replies (${state.allTickets.size})"),
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                    )
                }

                items(state.allTickets, key = { it.id }) { ticket ->
                    SupportTicketCard(ticket, state.storeSettings.locale) { onOpenTicket(ticket.id) }
                }
            }
        }
    }
}

@Composable
private fun SupportTicketCard(ticket: SupportTicket, locale: String, onClick: () -> Unit) {
    val content = ticket.presentation()
    val brandColors = LocalBrandColors.current
    Card(
        onClick = onClick,
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, brandColors.hairline),
        shape = MaterialTheme.shapes.medium,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(
            modifier = Modifier.padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = content.subject,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.weight(1f),
                )
                TicketStatusBadge(status = ticket.status)
            }

            TicketMetadata(content.orderNumber, formatTicketDate(ticket.createdAt, locale))
            Text(
                text = content.body,
                style = MaterialTheme.typography.bodySmall,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            if (ticket.adminReply.isNotBlank()) {
                Text(localized("رد فريق الدعم", "Support reply"), color = MaterialTheme.colorScheme.primary)
            }
        }
    }
}

@Composable
private fun TicketMetadata(number: String?, date: String?) {
    number?.let { Text(localized("الطلب $it", "Order $it"), style = MaterialTheme.typography.labelMedium) }
    date?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun TicketDetailsScreen(ticketId: String, onBack: () -> Unit, onSearch: () -> Unit, viewModel: SupportViewModel) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val ticket = state.allTickets.firstOrNull { it.id == ticketId }
    LaunchedEffect(ticketId) { viewModel.refreshTickets() }
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(localized("تفاصيل التذكرة", "Ticket details")) },
                actions = { SearchAction(onSearch) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Rounded.ArrowBack, localized("رجوع", "Back"))
                    }
                },
            )
        },
    ) { padding ->
        Column(
            Modifier.padding(padding).fillMaxSize().verticalScroll(rememberScrollState()).padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            if (ticket != null) {
                val content = ticket.presentation()
                Text(content.subject, style = MaterialTheme.typography.headlineSmall)
                TicketStatusBadge(status = ticket.status)
                TicketMetadata(content.orderNumber, formatTicketDate(ticket.createdAt, state.storeSettings.locale))
                HorizontalDivider()
                Text(localized("رسالتك", "Your message"), style = MaterialTheme.typography.titleMedium)
                Text(content.body)
                if (ticket.adminReply.isNotBlank()) {
                    HorizontalDivider()
                    Text(localized("رد فريق الدعم", "Support reply"), style = MaterialTheme.typography.titleMedium)
                    Text(ticket.adminReply)
                }
            } else if (state.form.isLoadingTickets) {
                CircularProgressIndicator()
            } else {
                Text(localized("تعذر عرض هذه التذكرة.", "This ticket could not be opened."))
            }
            if (state.form.ticketLoadFailed) {
                Text(localized("تعذر تحديث التذاكر.", "Tickets could not be refreshed."))
                OutlinedButton(onClick = viewModel::refreshTickets) { Text(localized("إعادة المحاولة", "Retry")) }
            }
        }
    }
}
