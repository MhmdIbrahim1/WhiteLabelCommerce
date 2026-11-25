package com.whitelabel.commerce.core.data.di

import com.whitelabel.commerce.core.data.repository.AuthRepositoryImpl
import com.whitelabel.commerce.core.data.repository.CartRepositoryImpl
import com.whitelabel.commerce.core.data.repository.CatalogRepositoryImpl
import com.whitelabel.commerce.core.data.repository.OrderRepositoryImpl
import com.whitelabel.commerce.core.data.repository.ReviewRepositoryImpl
import com.whitelabel.commerce.core.data.repository.StoreRepositoryImpl
import com.whitelabel.commerce.core.data.repository.SupportRepositoryImpl
import com.whitelabel.commerce.core.data.repository.WalletRepositoryImpl
import com.whitelabel.commerce.core.data.repository.WishlistRepositoryImpl
import com.whitelabel.commerce.core.domain.repository.AuthRepository
import com.whitelabel.commerce.core.domain.repository.CartRepository
import com.whitelabel.commerce.core.domain.repository.CatalogRepository
import com.whitelabel.commerce.core.domain.repository.OrderRepository
import com.whitelabel.commerce.core.domain.repository.ReviewRepository
import com.whitelabel.commerce.core.domain.repository.StoreRepository
import com.whitelabel.commerce.core.domain.repository.SupportRepository
import com.whitelabel.commerce.core.domain.repository.WalletRepository
import com.whitelabel.commerce.core.domain.repository.WishlistRepository
import com.whitelabel.commerce.core.notifications.NotificationRepository
import com.whitelabel.commerce.core.notifications.NotificationRepositoryImpl
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
abstract class RepositoryModule {

    @Binds
    @Singleton
    abstract fun bindStoreRepository(impl: StoreRepositoryImpl): StoreRepository

    @Binds
    @Singleton
    abstract fun bindCatalogRepository(impl: CatalogRepositoryImpl): CatalogRepository

    @Binds
    @Singleton
    abstract fun bindCartRepository(impl: CartRepositoryImpl): CartRepository

    @Binds
    @Singleton
    abstract fun bindOrderRepository(impl: OrderRepositoryImpl): OrderRepository

    @Binds
    @Singleton
    abstract fun bindSupportRepository(impl: SupportRepositoryImpl): SupportRepository

    @Binds
    @Singleton
    abstract fun bindAuthRepository(impl: AuthRepositoryImpl): AuthRepository

    @Binds
    @Singleton
    abstract fun bindNotificationRepository(impl: NotificationRepositoryImpl): NotificationRepository

    @Binds
    @Singleton
    abstract fun bindWalletRepository(impl: WalletRepositoryImpl): WalletRepository

    @Binds
    @Singleton
    abstract fun bindReviewRepository(impl: ReviewRepositoryImpl): ReviewRepository

    @Binds
    @Singleton
    abstract fun bindWishlistRepository(impl: WishlistRepositoryImpl): WishlistRepository
}
