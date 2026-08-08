package com.statcosol.attendance.db

import android.content.Context
import androidx.room.Dao
import androidx.room.Database
import androidx.room.Entity
import androidx.room.Insert
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.Room
import androidx.room.RoomDatabase

@Entity(tableName = "queued_punch")
data class QueuedPunch(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val embeddingB64: String,
    val embeddingModel: String? = null,
    val punchTimeIso: String,
    val direction: String,
    val livenessScore: Double,
    val livenessChallengeType: String? = null,
    val livenessNonce: String? = null,
    val createdAt: Long = System.currentTimeMillis(),
    val attempts: Int = 0,
)

@Dao
interface PunchDao {
    @Insert
    suspend fun insert(p: QueuedPunch): Long

    @Query("SELECT * FROM queued_punch ORDER BY id ASC LIMIT 50")
    suspend fun next(): List<QueuedPunch>

    @Query("DELETE FROM queued_punch WHERE id = :id")
    suspend fun delete(id: Long)

    @Query("UPDATE queued_punch SET attempts = attempts + 1 WHERE id = :id")
    suspend fun bumpAttempts(id: Long)
}

@Database(entities = [QueuedPunch::class], version = 1, exportSchema = false)
abstract class AppDatabase : RoomDatabase() {
    abstract fun punchDao(): PunchDao

    companion object {
        fun build(ctx: Context): AppDatabase =
            Room.databaseBuilder(ctx.applicationContext, AppDatabase::class.java, "statco-attendance.db")
                .fallbackToDestructiveMigration()
                .build()
    }
}
