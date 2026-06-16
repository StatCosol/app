package com.statcosol.attendance.db

import android.content.Context
import androidx.room.ColumnInfo
import androidx.room.Dao
import androidx.room.Database
import androidx.room.Delete
import androidx.room.Entity
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.Room
import androidx.room.RoomDatabase

@Entity(tableName = "queued_punch")
data class QueuedPunch(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    @ColumnInfo(name = "payload_json") val payloadJson: String,
    @ColumnInfo(name = "created_at") val createdAt: Long = System.currentTimeMillis(),
)

@Dao
interface QueuedPunchDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(punch: QueuedPunch): Long

    @Query("SELECT * FROM queued_punch ORDER BY created_at ASC")
    suspend fun getAll(): List<QueuedPunch>

    @Delete
    suspend fun delete(punch: QueuedPunch)

    @Query("DELETE FROM queued_punch WHERE id = :id")
    suspend fun deleteById(id: Long)

    @Query("SELECT COUNT(*) FROM queued_punch")
    suspend fun count(): Int
}

@Database(entities = [QueuedPunch::class], version = 1, exportSchema = false)
abstract class AppDatabase : RoomDatabase() {

    abstract fun queuedPunchDao(): QueuedPunchDao

    companion object {
        @Volatile
        private var INSTANCE: AppDatabase? = null

        fun getInstance(context: Context): AppDatabase =
            INSTANCE ?: synchronized(this) {
                INSTANCE ?: Room.databaseBuilder(
                    context.applicationContext,
                    AppDatabase::class.java,
                    "attendance_db"
                ).build().also { INSTANCE = it }
            }
    }
}
