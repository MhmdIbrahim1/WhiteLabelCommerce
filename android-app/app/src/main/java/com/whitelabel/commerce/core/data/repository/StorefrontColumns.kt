package com.whitelabel.commerce.core.data.repository

internal const val PRODUCT_COLUMNS = "id,category_id,slug,name_en,name,description_en,description,price,old_price,flash_sale_price,flash_sale_starts_at,flash_sale_ends_at,stock,max_order_qty,is_active,sizes,colors,image_path,image_paths,color_images,color_galleries,product_variants(color,size,stock),specifications,avg_rating,review_count,created_at"
internal const val REVIEW_COLUMNS = "id,store_id,product_id,author_name,rating,comment,is_verified_purchase,status,admin_reply,admin_replied_at,review_replies(role,body,created_at),created_at,updated_at"
internal const val SETTINGS_COLUMNS = "default_max_order_qty,ui_config,cod_enabled,paymob_enabled,paymob_card_enabled,paymob_wallet_enabled,id,store_name,currency,locale,primary_color,secondary_color,surface_color,border_radius,whatsapp_number,support_email,shipping_fee,cart_incentive_enabled,free_shipping_threshold,cashback_enabled,cashback_percentage,theme_template,banners"
internal const val CATEGORY_COLUMNS = "id,slug,name_en,name,products!products_category_store_fk!inner(store_id,is_active)"
