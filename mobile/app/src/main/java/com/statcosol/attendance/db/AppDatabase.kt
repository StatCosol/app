package com.statcosol.attendance.db

import androidx.room.Database
import androidx.room.Entity
import androidx.room.PrimaryKey
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.Dao
import androidx.room.Insert
import androidx.room.Query
import android.content.Context

/** A punch waiting to be uploaded. */
@Entity(tableName = "queued_punch")
data class QueuedPunch(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val employeeId: String,
    val employeeCode: String,
    val punchTimeIso: String,
    val direction: String,
    val matchScore: Double,
    val livenessScore: Double,
    val captureLat: Double?,
    val captureLng: Double?,
    val captureAccuracyM: Double?,
    val createdAt: Long = System.currentTimeMillis(),
    val attempts: Int = 0
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

    @Query("SELECT COUNT(*) FROM queued_punch")
    suspend fun count(): Int
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
